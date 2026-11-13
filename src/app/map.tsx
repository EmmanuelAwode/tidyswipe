import { Image } from 'expo-image';
import * as ML from 'expo-media-library/legacy';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { GeoPoint, getGeotagged } from '../../modules/photo-tools';
import { useTheme } from '../theme/theme';
import { uriForId } from '../services/photos';

/** Native module first (PhotoKit predicate); otherwise scan up to 3000 recent assets. */
async function loadPoints(): Promise<GeoPoint[]> {
  const native = await getGeotagged();
  if (native) return native;
  const out: GeoPoint[] = [];
  let after: string | undefined;
  for (let i = 0; i < 6; i++) {
    const page = await ML.getAssetsAsync({
      mediaType: ['photo', 'video'], first: 500, after, sortBy: [[ML.SortBy.creationTime, false]],
    });
    for (const a of page.assets) if (a.location) out.push({ id: a.id, lat: a.location.latitude, lng: a.location.longitude });
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  return out;
}

type Cluster = { lat: number; lng: number; ids: string[] };

function cluster(points: GeoPoint[], region: Region): Cluster[] {
  const cell = Math.max(region.latitudeDelta, 0.0005) / 6;
  const map = new Map<string, Cluster>();
  for (const p of points) {
    const k = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const c = map.get(k);
    if (c) {
      c.lat += (p.lat - c.lat) / (c.ids.length + 1);
      c.lng += (p.lng - c.lng) / (c.ids.length + 1);
      c.ids.push(p.id);
    } else map.set(k, { lat: p.lat, lng: p.lng, ids: [p.id] });
  }
  return [...map.values()];
}

export default function PhotoMap() {
  const t = useTheme();
  const [points, setPoints] = useState<GeoPoint[] | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [open, setOpen] = useState<string[] | null>(null);

  useEffect(() => {
    loadPoints().then((p) => {
      setPoints(p);
      if (p.length) setRegion({ latitude: p[0].lat, longitude: p[0].lng, latitudeDelta: 60, longitudeDelta: 60 });
    }).catch(() => setPoints([]));
  }, []);

  const clusters = useMemo(() => (points && region ? cluster(points, region) : []), [points, region]);

  if (!points) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!points.length) return <View style={styles.center}><Text style={{ color: t.sub }}>No geotagged photos found.</Text></View>;

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} initialRegion={region!} onRegionChangeComplete={setRegion}>
        {clusters.map((c) => (
          <Marker
            key={`${c.lat.toFixed(5)}:${c.lng.toFixed(5)}:${c.ids.length}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            onPress={() => setOpen(c.ids.slice(0, 60))}
          >
            <View style={[styles.pin, { backgroundColor: t.accent }]}>
              <Text style={styles.pinText}>{c.ids.length}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <Modal visible={!!open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <Pressable onPress={() => setOpen(null)} style={{ padding: 16 }}>
            <Text style={{ color: t.accent, fontWeight: '700' }}>Done</Text>
          </Pressable>
          <FlatList
            data={open ?? []} numColumns={3} keyExtractor={(i) => i}
            renderItem={({ item }) => (
              <View style={styles.cell}>
                <Image source={{ uri: uriForId(item) }} style={styles.thumb} contentFit="cover" recyclingKey={item} />
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pin: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2, borderColor: '#fff' },
  pinText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cell: { width: '33.33%', aspectRatio: 1, padding: 2 },
  thumb: { flex: 1, borderRadius: 8 },
});
