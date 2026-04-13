import { GOLD, GOLD_FAINT, BG_GROUND, BG_SURFACE, INK, TEXT_SEC, BORDER, SECTION_A, SECTION_B, SECTION_C, SECTION_D } from '../constants/colors';
import React from 'react';
import { View, StyleSheet, SectionList, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { useActiveTrack, usePlaybackState, State } from 'react-native-track-player';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Track } from '../types';
import { TRACKS, SECTIONS } from '../constants/tracks';
import { useSettingsStore } from '../store/settingsStore';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { setAlignSeekExpectedUntil, shouldSeekAlign, loadPlayerState } from '../utils/storage';
import { loadTrack } from '../utils/trackManager';

const SECTION_COLORS: Record<string, string> = { A: SECTION_A, B: SECTION_B, C: SECTION_C, D: SECTION_D };

interface SectionData { title: string; code: string; data: Track[]; }

const PlaylistScreen: React.FC = () => {
  const activeTrack = useActiveTrack();
  const playbackState = usePlaybackState();
  const isPlaying = playbackState.state === State.Playing;
  const { isCareMode } = useSettingsStore();

  const handleTrackPress = async (track: Track, globalIndex: number) => {
    await loadTrack(globalIndex);
    const pm = loadPlayerState()?.playMode || 'repeat-one';
    if (track.durationMs && shouldSeekAlign(pm)) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
    }
    await TrackPlayer.play();
  };

  const sectionData: SectionData[] = SECTIONS.map(s => ({
    title: s.name,
    code: s.code,
    data: TRACKS.filter(t => t.section === s.code),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <SectionList
        sections={sectionData}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionBadge, { backgroundColor: SECTION_COLORS[section.code] || '#888' }]}>
              <Text style={[styles.sectionBadgeText, isCareMode && { fontSize: 16 }]}>{section.code}</Text>
            </View>
            <Text style={[styles.sectionTitle, isCareMode && { fontSize: 22 }]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isActive = item.id === activeTrack?.id;
          const globalIndex = TRACKS.findIndex(t => t.id === item.id);
          if (globalIndex < 0) return null;
          return (
            <TouchableOpacity
              style={[styles.trackItem, isActive && styles.activeTrack]}
              activeOpacity={0.6}
              onPress={() => handleTrackPress(item, globalIndex)}>
              {isActive && <View style={[styles.activeBar, { backgroundColor: SECTION_COLORS[item.section] || GOLD }]} />}
              <View style={[styles.codeBox, { borderColor: SECTION_COLORS[item.section] || '#888' }]}>
                <Text style={[styles.codeText, isCareMode && { fontSize: 14 }]}>{item.code}</Text>
              </View>
              <View style={styles.trackInfo}>
                <Text style={[styles.trackTitle, isActive && styles.activeText, isCareMode && { fontSize: 20 }]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              {isActive && (
                <Icon name={isPlaying ? 'equalizer' : 'pause'} size={isCareMode ? 28 : 22} color={GOLD} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_GROUND },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, marginTop: 8 },
  sectionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 10 },
  sectionBadgeText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  sectionTitle: { color: INK, fontSize: 17, fontWeight: 'bold' },
  trackItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, backgroundColor: BG_SURFACE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  activeTrack: { backgroundColor: GOLD_FAINT },
  activeBar: { position: 'absolute', left: 0, top: 4, bottom: 4, width: 4, borderRadius: 2 },
  codeBox: { width: 42, height: 28, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  codeText: { color: TEXT_SEC, fontSize: 11, fontWeight: '600' },
  trackInfo: { flex: 1 },
  trackTitle: { color: INK, fontSize: 16 },
  activeText: { color: GOLD, fontWeight: '600' },
});

export default PlaylistScreen;
