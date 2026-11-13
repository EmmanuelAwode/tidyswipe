"""
End-to-end smoke test for the Android APK, run on an emulator in CI.

It seeds the emulator's gallery, installs the APK, then drives the real UI:
permission prompt, home, a swipe session (keep + delete), the deletion queue
and Android's own delete confirmation, the Months and More tabs, and a random
batch. Every screen's visible labels are printed so the log shows what the app
actually rendered. Exits non-zero if a critical step fails or the app crashes.
"""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PKG = 'com.personal.tidyswipe'
results = []  # (ok, critical, name, detail)
TOTAL_SEEDED = [999]  # photos + videos in the gallery before the test deletes anything


def adb(*args, timeout=90):
    try:
        r = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout, errors='replace')
        return (r.stdout or '') + (r.stderr or '')
    except subprocess.TimeoutExpired:
        return 'TIMEOUT'


def sh(cmd, timeout=90):
    return adb('shell', cmd, timeout=timeout)


def dump(_depth=0):
    """Returns [(label, kind, (cx, cy), resource_id)] for everything on screen."""
    nodes = _dump_once()
    # A slow CI emulator sometimes freezes System UI or the app; press Wait and look again.
    for label, _, c, _ in nodes:
        if "isn't responding" in label and _depth < 4:
            for l2, _, c2, _ in nodes:
                if l2.strip().lower() == 'wait':
                    sh(f'input tap {c2[0]} {c2[1]}')
                    break
            time.sleep(4)
            return dump(_depth + 1)
    return nodes


def _dump_once():
    for _ in range(5):
        out = sh('uiautomator dump /sdcard/ui.xml', timeout=40)
        if 'dumped' in out.lower():
            xml = adb('exec-out', 'cat', '/sdcard/ui.xml')
            start = xml.find('<hierarchy')
            if start >= 0:
                try:
                    root = ET.fromstring(xml[start:xml.rfind('>') + 1])
                except ET.ParseError:
                    time.sleep(1)
                    continue
                nodes = []
                for n in root.iter('node'):
                    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
                    if not m:
                        continue
                    x1, y1, x2, y2 = map(int, m.groups())
                    c = ((x1 + x2) // 2, (y1 + y2) // 2)
                    rid = n.get('resource-id', '')
                    if n.get('text'):
                        nodes.append((n.get('text'), 'text', c, rid))
                    if n.get('content-desc'):
                        nodes.append((n.get('content-desc'), 'desc', c, rid))
                return nodes
        time.sleep(1.5)
    return []


def labels(nodes):
    seen = []
    for label, _, _, _ in nodes:
        one = ' '.join(label.split())
        if one not in seen:
            seen.append(one)
    return seen


def show(title):
    nodes = dump()
    print(f'\n== {title}\n   ' + ' | '.join(labels(nodes))[:1500], flush=True)
    return nodes


def find(nodes, want, exact=True, kind=None, rid=None):
    out = []
    for label, k, c, r in nodes:
        l = ' '.join(label.split())
        hit = l.lower() == want.lower() if exact else want.lower() in l.lower()
        if hit and (kind is None or k == kind) and (rid is None or rid in r):
            out.append(c)
    return out


def wait_for(want, timeout=40, exact=False):
    end = time.time() + timeout
    nodes = []
    while time.time() < end:
        nodes = dump()
        if find(nodes, want, exact=exact):
            return nodes
        time.sleep(2)
    return None


def tap(nodes, want, which=0, exact=True, kind=None, rid=None):
    hits = find(nodes, want, exact=exact, kind=kind, rid=rid)
    if not hits:
        return False
    x, y = hits[which]
    sh(f'input tap {x} {y}')
    time.sleep(2.5)
    return True


def check(name, ok, detail='', critical=False):
    results.append((bool(ok), critical, name, detail))
    print(f"   [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail and not ok else ''}", flush=True)
    return bool(ok)


def back():
    sh('input keyevent KEYCODE_BACK')
    time.sleep(2)


def seed_media():
    print('Seeding gallery...', flush=True)
    sh('mkdir -p /sdcard/DCIM/Camera /sdcard/Pictures/Screenshots')
    for i in range(1, 7):
        sh(f'screencap -p /sdcard/DCIM/Camera/IMG_000{i}.png')
    for i in range(1, 4):
        sh(f'screencap -p /sdcard/Pictures/Screenshots/Screenshot_{i}.png')
    print('  video:', sh('screenrecord --time-limit 4 /sdcard/DCIM/Camera/VID_0001.mp4', timeout=30).strip()[:200])
    for i in range(2, 7):
        sh(f'cp /sdcard/DCIM/Camera/VID_0001.mp4 /sdcard/DCIM/Camera/VID_000{i}.mp4')
    # Make sure MediaStore has indexed the new files.
    sh('content call --uri content://media/ --method scan_volume --arg external_primary')
    time.sleep(6)
    n_img = sh('content query --uri content://media/external/images/media --projection _id').count('Row:')
    n_vid = sh('content query --uri content://media/external/video/media --projection _id').count('Row:')
    TOTAL_SEEDED[0] = n_img + n_vid
    print('  images indexed:', n_img)
    print('  videos indexed:', sh('content query --uri content://media/external/video/media --projection _id').count('Row:'))


SHOTS = 'shots'


def shot(name):
    """Saves a real screenshot (uploaded by CI) so the result can be looked at, not just parsed."""
    import os
    os.makedirs(SHOTS, exist_ok=True)
    data = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=60).stdout
    with open(f'{SHOTS}/{name}.png', 'wb') as f:
        f.write(data)


def screen_size():
    m = re.search(r'(\d+)x(\d+)', sh('wm size'))
    return (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)


def swipe_card(direction, w, h):
    y = int(h * 0.45)
    a, b = (int(w * 0.2), int(w * 0.85)) if direction == 'right' else (int(w * 0.8), int(w * 0.15))
    sh(f'input swipe {a} {y} {b} {y} 250')
    time.sleep(2.5)


def scroll_down(w, h):
    sh(f'input swipe {w // 2} {int(h * 0.8)} {w // 2} {int(h * 0.3)} 300')
    time.sleep(1.5)


def scroll_up(w, h):
    sh(f'input swipe {w // 2} {int(h * 0.3)} {w // 2} {int(h * 0.8)} 300')
    time.sleep(1.5)


def main():
    apk = sys.argv[1]
    print(adb('install', '-r', apk, timeout=300).strip()[-300:], flush=True)
    for k in ('window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'):
        sh(f'settings put global {k} 0')
    seed_media()
    w, h = screen_size()
    print(f'screen {w}x{h}')

    sh('logcat -c')
    sh(f'monkey -p {PKG} -c android.intent.category.LAUNCHER 1')
    time.sleep(12)

    # ---- Permission flow ----
    nodes = show('First launch')
    shot('01-first-launch')
    if find(nodes, 'Photo access needed'):
        check('Permission screen shown on first launch', True)
        tap(nodes, 'Allow access', exact=False)
        nodes = show('System permission dialog')
        shot('02-permission-dialog')
        # Android may ask twice: photos and videos, then location info in photos.
        for attempt in range(3):
            if not (tap(nodes, 'Allow all') or tap(nodes, 'Allow', exact=True) or tap(nodes, 'Allow all', exact=False)):
                if attempt == 0:
                    print('   could not find an Allow button; granting through adb instead')
                break
            nodes = show(f'After permission tap {attempt + 1}')
            shot(f'02-permission-dialog-{attempt + 2}')
    else:
        check('Permission screen shown on first launch', False, 'went straight past it')
    if not wait_for('Start a session', timeout=20):
        for p in ('READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'READ_EXTERNAL_STORAGE'):
            sh(f'pm grant {PKG} android.permission.{p}')
        sh(f'am force-stop {PKG}')
        sh(f'monkey -p {PKG} -c android.intent.category.LAUNCHER 1')

    # ---- Home ----
    nodes = wait_for('Start a session', timeout=60)
    if not check('Home screen renders', nodes is not None, critical=True):
        return
    time.sleep(6)
    shot('03-home')
    nodes = show('Home after counts load')
    for want in ('Library cleaned', 'Random photos', 'Random videos', 'Random mix', 'Recents'):
        check(f'Home shows "{want}"', find(nodes, want, exact=False))
    check('Tab bar shows Clean / Months / More', all(find(nodes, t) for t in ('Clean', 'Months', 'More')))
    check('Library count is not zero', not find(nodes, 'of 0 reviewed'), 'the app sees no photos', critical=True)
    scroll_down(w, h)
    shot('04-home-scrolled')
    nodes = show('Home scrolled')
    for want in ('Screenshots', 'Large videos', 'Similar shots'):
        check(f'Home lists "{want}"', find(nodes, want, exact=False))

    # ---- Swipe session on Recents (real gestures) ----
    scroll_up(w, h)
    tap(dump(), 'Recents')
    time.sleep(8)
    shot('05-deck-first-card')
    dump()  # clears any "not responding" pop-up before touching the card
    swipe_card('right', w, h)   # keep
    shot('06-after-keep')
    swipe_card('left', w, h)    # delete
    shot('07-after-delete')
    swipe_card('left', w, h)    # delete
    shot('08-after-second-delete')
    check('Swiped three cards without a crash', 'FATAL' not in adb('logcat', '-d', '-s', 'AndroidRuntime:E'), critical=True)
    back()
    time.sleep(2)

    # ---- Tabs ----
    nodes = wait_for('Start a session', timeout=20) or show('Expected home')
    nodes = show('Home after session')
    shot('09-home-after-session')
    tap(nodes, 'Months', which=-1)
    nodes = show('Months tab')
    shot('10-months')
    check('Months tab lists a year', any(re.fullmatch(r'20\d\d', l) for l in labels(nodes)))
    tap(nodes, 'More', which=-1)
    nodes = show('More tab')
    shot('11-more')
    for want in ('Waiting to be deleted', 'Undo history', 'Statistics', 'Bookmarks', 'Large videos'):
        check(f'More shows "{want}"', find(nodes, want))
    check('Photo map hidden on Android', not find(nodes, 'Photo map'))

    # ---- Deletion queue + Android's own confirmation ----
    tap(nodes, 'Waiting to be deleted')
    nodes = show('Deletion queue')
    shot('12-queue')
    sel = [l for l in labels(nodes) if re.fullmatch(r'\d+ selected', l)]
    check('Queue lists the swiped-left items', bool(sel) and sel[0] != '0 selected', str(labels(nodes))[:200])
    if tap(nodes, 'View item', kind='desc'):
        nodes = show('Viewer from queue')
        shot('13-viewer')
        check('Viewer opens with Done and Share', find(nodes, 'Done', exact=False) and find(nodes, 'Share', kind='desc'))
        back()
        nodes = show('Queue after closing viewer')
        check('Back button closes the viewer', any(re.fullmatch(r'\d+ selected', l) for l in labels(nodes)))
    tap(nodes, 'Delete', which=-1, kind='text')
    nodes = show('Confirm alert')
    shot('14-confirm')
    check('Confirm alert appears', any(l.startswith('Delete ') and l.endswith('?') for l in labels(nodes)))
    tap(nodes, 'Delete', rid='android:id/button')
    time.sleep(4)
    nodes = show('Android delete dialog')
    shot('15-system-delete-dialog')
    if not (tap(nodes, 'Allow') or tap(nodes, 'Delete') or tap(nodes, 'Move to trash', exact=False)):
        print('   no system dialog button found')
    time.sleep(5)
    shot('16-after-deletion')
    # Which item the swipes landed on varies, so count photos and videos together.
    left = (sh('content query --uri content://media/external/images/media --projection _id').count('Row:')
            + sh('content query --uri content://media/external/video/media --projection _id').count('Row:'))
    check('Items were really removed from the gallery', left < TOTAL_SEEDED[0], f'{left} items still there')

    # ---- Statistics / history / bookmarks ----
    time.sleep(8)
    shot('16b-after-deletion-settled')
    nodes = show('After deletion')
    if not find(nodes, 'Statistics'):
        if find(nodes, 'Clean') or find(nodes, 'More'):
            tap(nodes, 'More', which=-1)
        else:
            back()
            time.sleep(2)
            nodes = dump()
            if find(nodes, 'More') and not find(nodes, 'Statistics'):
                tap(nodes, 'More', which=-1)
        nodes = dump()
    tap(nodes, 'Statistics')
    nodes = show('Statistics')
    shot('17-statistics')
    check('Statistics renders', find(nodes, 'Reviewed') and find(nodes, 'Space recovered'))
    back()
    nodes = show('More (again)')
    tap(nodes, 'Undo history')
    nodes = show('Undo history')
    shot('18-history')
    check('History lists decisions', find(nodes, 'Kept') or find(nodes, 'Marked for deletion', exact=False))
    back()
    nodes = show('More (again)')
    tap(nodes, 'Bookmarks')
    show('Bookmarks')
    shot('19-bookmarks')
    back()

    # ---- Other collections: look at each one ----
    nodes = show('More (again)')
    tap(nodes, 'Large videos')
    time.sleep(6)
    shot('20-large-videos')
    # Flick through the videos faster than they can load; this used to exhaust the phone's decoders.
    for _ in range(8):
        sh(f'input swipe {int(w * 0.2)} {int(h * 0.45)} {int(w * 0.85)} {int(h * 0.45)} 120')
        time.sleep(0.35)
    time.sleep(3)
    shot('20b-after-fast-video-swipes')
    check('Fast swiping through videos does not crash',
          'FATAL' not in adb('logcat', '-d', '-s', 'AndroidRuntime:E') and bool(find(dump(), 'Keep') or find(dump(), 'All caught up', exact=False)),
          critical=True)
    back()
    tap(dump(), 'Clean', which=-1)
    time.sleep(1.5)
    tap(dump(), 'Random photos', exact=False)
    nodes = show('How many? alert')
    shot('21-batch-alert')
    check('Batch size alert shows 10 / 30 / 100', all(find(nodes, n) for n in ('10', '30', '100')))
    tap(nodes, '10')
    time.sleep(8)
    shot('22-random-batch')
    for _ in range(3):
        swipe_card('right', w, h)
    shot('23-random-batch-after-swipes')
    back()
    time.sleep(1.5)
    for name, label in (('24-similar', 'Similar shots'), ('25-screenshots', 'Screenshots'), ('26-onthisday', 'On this day')):
        nodes = dump()
        if not find(nodes, label, exact=False):
            scroll_down(w, h)
            nodes = dump()
        if tap(nodes, label, exact=False):
            time.sleep(6)
            shot(name)
            back()
            time.sleep(1.5)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # keep going to the report
        check('Test script ran to the end', False, repr(e), critical=True)

    crash = adb('logcat', '-d', '-s', 'AndroidRuntime:E')
    js = adb('logcat', '-d', '-s', 'ReactNativeJS:W')
    fatal = 'FATAL EXCEPTION' in crash
    print('\n== Native crashes\n' + ('\n'.join(crash.splitlines()[-40:]) if fatal else '   none'))
    print('\n== JS warnings and errors\n' + ('\n'.join(l[:400] for l in js.splitlines()[-60:]) or '   none'))
    check('No native crash', not fatal, critical=True)

    failed = [r for r in results if not r[0]]
    print(f'\n== Summary: {len(results) - len(failed)} passed, {len(failed)} failed')
    for ok, critical, name, detail in failed:
        print(f"   FAIL{' (critical)' if critical else ''}: {name} {detail}")
    sys.exit(1 if any(not ok and critical for ok, critical, _, _ in results) else 0)
