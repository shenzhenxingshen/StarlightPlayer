import React from 'react';
import { View, StyleSheet, SectionList, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { useActiveTrack } from 'react-native-track-player';
import { Track } from '../types';
import { TRACKS, SECTIONS } from '../constants/tracks';
import { useSettingsStore } from '../store/settingsStore';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { incrementPlaybackCount } from '../utils/storage';

interface SectionData { title: string; data: Track[]; }

const PlaylistScreen: React.FC = () => {
  const activeTrack = useActiveTrack();
  const { isLargeTextMode } = useSettingsStore();

  const handleTrackPress = async (track: Track, index: number) => {
    await TrackPlayer.skip(index);
    if (track.durationMs) {
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
      incrementPlaybackCount(track.id);
    }
    await TrackPlayer.play();
  };

  const sectionData: SectionData[] = SECTIONS.map(s => ({
    title: s.name,
    data: TRACKS.filter(t => t.section === s.code),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={[styles.header, isLargeTextMode && { fontSize: 32 }]}>播放列表</Text>
      <SectionList
        sections={sectionData}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isLargeTextMode && { fontSize: 24 }]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, index }) => {
          const isActive = item.id === activeTrack?.id;
          return (
            <TouchableOpacity
              style={[styles.trackItem, isActive && styles.activeTrack]}
              onPress={() => handleTrackPress(item, index)}>
              <View style={styles.trackInfo}>
                <Text style={[styles.trackTitle, isActive && styles.activeText, isLargeTextMode && { fontSize: 22 }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.trackCode, isLargeTextMode && { fontSize: 18 }]}>{item.code}</Text>
              </View>
              {isActive && <Text style={[styles.playingBadge, isLargeTextMode && { fontSize: 18 }]}>播放中</Text>}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { color: '#fff', fontSize: 24, fontWeight: 'bold', paddingHorizontal: 20, paddingVertical: 20 },
  sectionHeader: { backgroundColor: '#1e1e1e', paddingVertical: 10, paddingHorizontal: 15, marginTop: 10, borderRadius: 8 },
  sectionTitle: { color: '#ffd700', fontSize: 18, fontWeight: 'bold' },
  trackItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  activeTrack: { backgroundColor: 'rgba(255,255,255,0.05)' },
  trackInfo: { flex: 1 },
  trackTitle: { color: '#fff', fontSize: 16, fontWeight: '500', marginBottom: 4 },
  trackCode: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  activeText: { color: '#1DB954' },
  playingBadge: { color: '#1DB954', fontSize: 12, marginLeft: 8 },
});

export default PlaylistScreen;
