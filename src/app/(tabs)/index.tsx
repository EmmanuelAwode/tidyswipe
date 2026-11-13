import { Image } from 'expo-image';
import { SFSymbol } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Tap } from '../../components/ui';
import { Stats, getStats } from '../../db/database';
import { openCollection } from '../../services/nav';
import {
  Access, PhotoAsset, countFor, firstAssetFor, formatBytes, getAccess, manageLimited, requestAccess,
} from '../../services/photos';
import { Theme, useTheme } from '../../theme/theme';

type Info = { count: number; preview: PhotoAsset | null };

const SESSIONS: { key: string; title: string; icon: SFSymbol }[] = [
  { key: 'random:photo', title: 'Random photos', icon: 'photo.fill' },
  { key: 'random:video', title: 'Random videos', icon: 'video.fill' },
  { key: 'random', title: 'Random mix', icon: 'shuffle' },
];
const COLLECTIONS: { key: string; title: string; icon: SFSymbol; tint: string }[] = [
  { key: 'recents', title: 'Recents', icon: 'clock.fill', tint: '#5B8DEF' },
  { key: 'onthisday', title: 'On this day', icon: 'calendar', tint: '#F5A524' },
  { key: 'screenshots', title: 'Screenshots', icon: 'camera.viewfinder', tint: '#30B0C7' },
  { key: 'videos', title: 'Large videos', icon: 'film.fill', tint: '#BF5AF2' },
  { key: 'similar', title: 'Similar shots', icon: 'square.on.square', tint: '#FF6B6B' },
];

export default function Home() {
  const t = useTheme();
  const [access, setAccess] = useState<Access | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [info, setInfo] = useState<Record<string, Info>>({});

  const load = useCallback(async () => {
    const a = await getAccess();
    setAccess(a);
    if (a === 'denied' || a === 'undetermined') return;
    try {
      setStats(await getStats());
      setTotal(await countFor('recents'));
      const keys = [...SESSIONS, ...COLLECTIONS].map((c) => c.key).filter((k) => k !== 'similar');
      for (const key of keys) {
        const entry = { count: await countFor(key), preview: await firstAssetFor(key) };
        setInfo((prev) => ({ ...prev, [key]: entry }));
      }
    } catch {
      // library unavailable; the screen still renders with placeholders
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void load());
    return () => sub.remove();
  }, [load]);

  if (access === null) return <View style={styles.center}><ActivityIndicator /></View>;

  if (access === 'denied' || access === 'undetermined') {
    return (
      <View style={[styles.center, { padding: 32, gap: 16 }]}>
        <View style={[styles.bubble, { backgroundColor: t.accent + '24', width: 84, height: 84, borderRadius: 42 }]}>
          <Icon name="photo.on.rectangle.angled" size={38} color={t.accent} />
        </View>
        <Text style={[styles.h1, { color: t.text, textAlign: 'center' }]}>Photo access needed</Text>
        <Text style={{ color: t.sub, textAlign: 'center', fontSize: 15, lineHeight: 21 }}>
          Tidyswipe works entirely on your iPhone. Your photos are never uploaded.
        </Text>
        <Button
          title={access === 'denied' ? 'Open Settings' : 'Allow access'}
          color={t.accent}
          onPress={async () => {
            if (access === 'denied') await Linking.openSettings();
            else setAccess(await requestAccess());
            void load();
          }}
        />
      </View>
    );
  }

  const reviewed = stats?.reviewed ?? 0;
  const pct = total ? Math.min(1, reviewed / total) : 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.h1, { color: t.text }]}>Tidyswipe</Text>

        {access === 'limited' && (
          <Tap onPress={() => manageLimited()} style={[styles.notice, { backgroundColor: t.card }]}>
            <Icon name="exclamationmark.circle.fill" size={18} color="#F5A524" />
            <Text style={{ color: t.text, flex: 1 }}>Only selected photos are visible. Tap to choose more.</Text>
          </Tap>
        )}

        {/* Hero: overall progress at a glance */}
        <Animated.View entering={FadeInDown.duration(300)} style={[styles.hero, { backgroundColor: t.accent }]}>
          <Text style={styles.heroLabel}>Library cleaned</Text>
          <Text style={styles.heroPct}>{Math.round(pct * 100)}%</Text>
          <View style={styles.heroTrack}>
            <View style={{ width: `${Math.max(pct * 100, 1.5)}%`, height: '100%', backgroundColor: '#fff', borderRadius: 4 }} />
          </View>
          <View style={styles.heroRow}>
            <HeroStat value={reviewed.toLocaleString()} label={`of ${total.toLocaleString()} reviewed`} />
            <HeroStat value={formatBytes(stats?.bytesCleaned ?? 0)} label="freed" />
            <HeroStat value={`${stats?.streak ?? 0}`} label="day streak" />
          </View>
        </Animated.View>

        {(stats?.pending ?? 0) > 0 && (
          <Tap onPress={() => router.push('/review')} style={[styles.pending, { backgroundColor: t.del + '22' }]}>
            <Icon name="trash.fill" size={18} color={t.del} />
            <Text style={{ color: t.del, fontWeight: '700', flex: 1 }}>
              {stats!.pending} waiting to be deleted
            </Text>
            <Icon name="chevron.right" size={14} color={t.del} />
          </Tap>
        )}

        <Text style={[styles.h2, { color: t.text }]}>Start a session</Text>
        <View style={styles.sessions}>
          {SESSIONS.map((s, i) => (
            <Tap key={s.key} onPress={() => openCollection(s.key)} label={s.title} style={[styles.session, i === 2 && styles.sessionWide, { backgroundColor: t.card }]}>
              {info[s.key]?.preview && (
                <Image source={{ uri: info[s.key]!.preview!.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              )}
              <View style={styles.shade} />
              <View style={styles.sessionIcon}><Icon name={s.icon} size={18} color="#fff" /></View>
              <View>
                <Text style={styles.sessionTitle}>{s.title}</Text>
                <Text style={styles.sessionSub}>
                  {info[s.key] ? `${info[s.key]!.count.toLocaleString()} items` : ' '}
                </Text>
              </View>
            </Tap>
          ))}
        </View>

        <Text style={[styles.h2, { color: t.text }]}>Collections</Text>
        <View style={[styles.list, { backgroundColor: t.card }]}>
          {COLLECTIONS.map((c, i) => (
            <Row
              key={c.key} t={t} icon={c.icon} tint={c.tint} title={c.title} last={i === COLLECTIONS.length - 1}
              detail={c.key === 'similar' ? '' : info[c.key] ? info[c.key]!.count.toLocaleString() : ''}
              onPress={() => openCollection(c.key)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const HeroStat = ({ value, label }: { value: string; label: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{value}</Text>
    <Text style={{ color: '#ffffffb3', fontSize: 11 }}>{label}</Text>
  </View>
);

export function Row({ t, icon, tint, title, detail, onPress, last }: {
  t: Theme; icon: SFSymbol; tint: string; title: string; detail?: string; onPress: () => void; last?: boolean;
}) {
  return (
    <Tap onPress={onPress} label={title} hitSlop={0} style={styles.row}>
      <View style={[styles.bubble, { backgroundColor: tint + '26' }]}>
        <Icon name={icon} size={17} color={tint} />
      </View>
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{title}</Text>
        {!!detail && <Text style={{ color: t.sub, fontSize: 14 }}>{detail}</Text>}
        <Icon name="chevron.right" size={12} color={t.sub} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 32, gap: 16 },
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16 },

  hero: { borderRadius: 28, padding: 22, gap: 6 },
  heroLabel: { color: '#ffffffcc', fontWeight: '600', fontSize: 13 },
  heroPct: { color: '#fff', fontSize: 52, fontWeight: '800', letterSpacing: -1 },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: '#ffffff40', overflow: 'hidden' },
  heroRow: { flexDirection: 'row', marginTop: 14, gap: 8 },

  pending: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 18 },

  sessions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  session: { flexGrow: 1, flexBasis: '45%', height: 150, borderRadius: 24, overflow: 'hidden', padding: 14, justifyContent: 'space-between' },
  sessionWide: { flexBasis: '100%', height: 110 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  sessionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  sessionTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
  sessionSub: { color: '#ffffffcc', fontSize: 12, marginTop: 1 },

  list: { borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, gap: 12 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 15, paddingRight: 14 },
  bubble: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
