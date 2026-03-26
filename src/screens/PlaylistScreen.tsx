import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SectionList, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlaylistStore } from '../store/playlistStore';
import { usePlayerStore } from '../store/playerStore';
import { Track } from '../types';
import { TRACKS, SECTIONS } from '../constants/tracks';
import { formatTime, msToSeconds } from '../utils/syncUtils';
import { isLargeTextMode } from '../utils/storage';

interface SectionData {
  title: string;
  data: Track[];
}

const PlaylistScreen: React.FC = () => {
  const { addPlaylist, selectTrack, currentIndex } = usePlaylistStore();
  const { play, stop } = usePlayerStore();
  const [largeTextMode, setLargeTextMode] = useState(false);

  useEffect(() => {
    // 初始化播放列表
    addPlaylist(TRACKS);
    setLargeTextMode(isLargeTextMode());
  }, []);

  useEffect(() => {
    setLargeTextMode(isLargeTextMode());
  }, [isLargeTextMode()]);

  const handleTrackPress = async (track: Track, index: number) => {
    if (currentIndex !== index) {
      await stop();
      await selectTrack(index);
    }
    await play();
  };

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, largeTextMode && styles.sectionTitleLarge]}>
        {section.title}
      </Text>
    </View>
  );

  const renderTrack = ({ item, index }: { item: Track; index: number }) => {
    const isActive = index === currentIndex;
    
    return (
      <TouchableOpacity
        style={[styles.trackItem, isActive && styles.activeTrack]}
        onPress={() => handleTrackPress(item, index)}
      >
        <View style={styles.trackArtworkPlaceholder}>
          <Text style={[styles.trackArtworkPlaceholderText, largeTextMode && styles.trackArtworkPlaceholderTextLarge]}>
            🎵
          </Text>
        </View>
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isActive && styles.activeText, largeTextMode && styles.trackTitleLarge]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.trackSubtitle, largeTextMode && styles.trackSubtitleLarge]} numberOfLines={1}>
            {item.code}
          </Text>
        </View>
        {isActive && (
          <Text style={[styles.playingIndicator, largeTextMode && styles.playingIndicatorLarge]}>
            播放中
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const sectionData: SectionData[] = SECTIONS.map(section => ({
    title: section.name,
    data: TRACKS.filter(track => track.section === section.code),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={[styles.header, largeTextMode && styles.headerLarge]}>播放列表</Text>
      <SectionList
        sections={sectionData}
        renderItem={renderTrack}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerLarge: {
    fontSize: 32,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionHeader: {
    backgroundColor: '#1e1e1e',
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginTop: 10,
    borderRadius: 8,
  },
  sectionTitle: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionTitleLarge: {
    fontSize: 24,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  trackArtworkPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackArtworkPlaceholderText: {
    fontSize: 24,
  },
  trackArtworkPlaceholderTextLarge: {
    fontSize: 36,
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  trackTitleLarge: {
    fontSize: 22,
  },
  trackSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  trackSubtitleLarge: {
    fontSize: 18,
  },
  activeText: {
    color: '#1DB954',
  },
  playingIndicator: {
    color: '#1DB954',
    fontSize: 12,
    marginLeft: 8,
  },
  playingIndicatorLarge: {
    fontSize: 18,
  },
});

export default PlaylistScreen;