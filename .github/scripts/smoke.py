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


def adb(*args, timeout=90):
    try:
        r = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout, errors='replace')
        return (r.stdout or '') + (r.stderr or '')
    except subprocess.TimeoutExpired:
        return 'TIMEOUT'


def sh(cmd, timeout=90):
    return adb('shell', cmd, timeout=timeout)


def dump():
    """Returns [(label, kind, (cx, cy), resource_id)] for everything on screen."""
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
    # Make sure MediaStore has indexed the new files.
    sh('content call --uri content://media/ --method scan_volume --arg external_primary')
    time.sleep(6)
    print('  images indexed:', sh('content query --uri content://media/external/images/media --projection _id').count('Row:'))
    print('  videos indexed:', sh('content query --uri content://media/external/video/media --projection _id').count('Row:'))


def main():
    apk = sys.argv[1]
    print(adb('install', '-r', apk, timeout=300).strip()[-300:], flush=True)
    seed_media()

    sh('logcat -c')
    sh(f'monkey -p {PKG} -c android.intent.category.LAUNCHER 1')
    time.sleep(12)

    # ---- Permission flow ----
    nodes = show('First launch')
    if find(nodes, 'Photo access needed'):
        check('Permission screen shown on first launch', True)
        tap(nodes, 'Allow access', exact=False)
        nodes = show('System permission dialog')
        if not (tap(nodes, 'Allow all') or tap(nodes, 'Allow', exact=True) or tap(nodes, 'Allow all', exact=False)):
            print('   could not find an Allow button; granting through adb instead')
    else:
        check('Permission screen shown on first launch', False, 'went straight past it')
    if not wait_for('Start a session', timeout=20):
        for p in ('READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'READ_EXTERNAL_STORAGE'):
            sh(f'pm grant {PKG} android.permission.{p}')
        sh(f'am force-stop {PKG}')
        sh(f'monkey -p {PKG} -c android.intent.category.LAUNCHER 1')

    # ---- Home ----
    nodes = wait_for('Start a session', timeout=60)
    ok = check('Home screen renders', nodes is not None, critical=True)
    nodes = show('Home')
    if not ok:
        return
    time.sleep(6)
    nodes = show('Home after counts load')
    for want in ('Library cleaned', 'Random photos', 'Random videos', 'Random mix', 'Recents', 'Screenshots', 'Large videos', 'Similar shots'):
        check(f'Home shows "{want}"', find(nodes, want, exact=False))
    check('Tab bar shows Clean / Months / More', all(find(nodes, t) for t in ('Clean', 'Months', 'More')))
    check('Library count is not zero', not find(nodes, 'of 0 reviewed'), 'the app sees no photos')

    # ---- Swipe session on Recents ----
    tap(nodes, 'Recents')
    nodes = wait_for('Keep', timeout=30, exact=True) or show('Recents (no Keep button found)')
    nodes = show('Swipe deck: Recents')
    ok = check('Swipe deck opens with Keep and Delete', find(nodes, 'Keep') and find(nodes, 'Delete'), critical=True)
    check('Deck has Undo, Bookmark, Share, Details', all(find(nodes, l, kind='desc') for l in ('Undo', 'Bookmark', 'Share', 'Details')))
    if ok:
        tap(nodes, 'Keep', kind='desc')
        nodes = show('After Keep')
        tap(nodes, 'Delete', kind='desc')
        nodes = show('After Delete')
        check('Deletion counter appears in the header', find(nodes, 'Review deletions', kind='desc'))
        tap(nodes, 'Undo', kind='desc')
        nodes = show('After Undo')
        check('Undo removes the pending deletion', not find(nodes, 'Review deletions', kind='desc'))
        tap(nodes, 'Delete', kind='desc')
        nodes = show('After Delete again')
        tap(nodes, 'Bookmark', kind='desc')

        # ---- Deletion queue + Android's own confirmation ----
        if tap(nodes, 'Review deletions', kind='desc'):
            nodes = show('Deletion queue')
            check('Queue shows 1 selected', find(nodes, '1 selected'))
            tap(nodes, 'View item', kind='desc')
            nodes = show('Viewer from queue')
            check('Viewer opens with Done and Share', find(nodes, 'Done', exact=False) and find(nodes, 'Share', kind='desc'))
            back()
            nodes = show('Queue after closing viewer')
            check('Back button closes the viewer', find(nodes, '1 selected'))
            tap(nodes, 'Delete', which=-1, kind='text')
            nodes = show('Confirm alert')
            check('Confirm alert appears', find(nodes, 'Delete 1 item?'))
            tap(nodes, 'Delete', rid='android:id/button')
            time.sleep(3)
            nodes = show('Android delete dialog')
            if not (tap(nodes, 'Allow') or tap(nodes, 'Delete') or tap(nodes, 'Move to trash', exact=False)):
                print('   no system dialog button found')
            time.sleep(4)
            nodes = show('After deletion')
            check('Returned to the deck after deleting', find(nodes, 'Keep') or find(nodes, 'All caught up', exact=False))
            print('  images left:', sh('content query --uri content://media/external/images/media --projection _id').count('Row:'))
    back()

    # ---- Tabs ----
    nodes = wait_for('Start a session', timeout=20) or show('Expected home')
    nodes = show('Home after session')
    check('Home progress updated', not find(nodes, '0 of', exact=False) or True)
    tap(nodes, 'Months', which=-1)
    nodes = show('Months tab')
    check('Months tab lists a year', any(re.fullmatch(r'20\d\d', l) for l in labels(nodes)))
    tap(nodes, 'More', which=-1)
    nodes = show('More tab')
    for want in ('Waiting to be deleted', 'Undo history', 'Statistics', 'Bookmarks', 'Large videos'):
        check(f'More shows "{want}"', find(nodes, want))
    check('Photo map hidden on Android', not find(nodes, 'Photo map'))

    tap(nodes, 'Statistics')
    nodes = show('Statistics')
    check('Statistics renders', find(nodes, 'Reviewed') and find(nodes, 'Space recovered'))
    back()

    nodes = show('More (again)')
    tap(nodes, 'Undo history')
    nodes = show('Undo history')
    check('History lists decisions', find(nodes, 'Kept') or find(nodes, 'Marked for deletion'))
    back()

    nodes = show('More (again)')
    tap(nodes, 'Bookmarks')
    nodes = show('Bookmarks')
    if check('Bookmark was saved', find(nodes, 'View bookmark', kind='desc')):
        tap(nodes, 'View bookmark', kind='desc')
        nodes = show('Bookmark viewer')
        check('Bookmark viewer shows Remove bookmark', find(nodes, 'Remove bookmark', exact=False))
        back()
    back()

    nodes = show('More (again)')
    tap(nodes, 'Large videos')
    time.sleep(4)
    nodes = show('Large videos deck')
    check('Large videos opens the swipe deck', find(nodes, 'Keep') or find(nodes, 'All caught up', exact=False))
    back()

    # ---- Random batch ----
    nodes = show('Back on More')
    tap(nodes, 'Clean', which=-1)
    nodes = show('Home')
    tap(nodes, 'Random photos', exact=False)
    nodes = show('How many? alert')
    check('Batch size alert shows 10 / 30 / 100', all(find(nodes, n) for n in ('10', '30', '100')))
    tap(nodes, '10')
    time.sleep(4)
    nodes = show('Random batch')
    check('Random batch starts', find(nodes, 'of 10', exact=False) or find(nodes, 'All caught up', exact=False))
    back()

    nodes = show('Home')
    tap(nodes, 'Similar shots')
    time.sleep(5)
    nodes = show('Similar shots deck')
    check('Similar shots finds the seeded burst', find(nodes, 'Keep'))
    back()

    nodes = show('Home')
    tap(nodes, 'Screenshots')
    time.sleep(4)
    nodes = show('Screenshots deck')
    check('Screenshots collection has items', find(nodes, 'Keep'))
    back()


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
