import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Track } from '../types';

interface TrackInfoProps {
  track: Track | null;
  isLargeTextMode?: boolean;
}

const TrackInfo: React.FC<TrackInfoProps> = ({ 
  track, 
  isLargeTextMode = false 
}) => {
  const getArtworkSize = () => isLargeTextMode ? 320 : 280;
  const getTitleFontSize = () => isLargeTextMode ? 32 : 24;
  const getArtistFontSize = () => isLargeTextMode ? 24 : 16;
  const getIconSize = () => isLargeTextMode ? 80 : 64;

  if (!track) {
    return (
      <View style={styles.container}>
        <View 
          style={[
            styles.artworkPlaceholder, 
            { 
              width: getArtworkSize(), 
              height: getArtworkSize() 
            }
          ]} 
        />
        <Text style={[styles.noTrackText, { fontSize: getTitleFontSize() }]}>
          无播放曲目
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View 
        style={[
          styles.artworkPlaceholder, 
          { 
            width: getArtworkSize(), 
            height: getArtworkSize() 
          }
        ]}
      >
        <Text style={{ fontSize: getIconSize() }}>🎵</Text>
      </View>
      <Text 
        style={[styles.title, { fontSize: getTitleFontSize() }]} 
        numberOfLines={2}
      >
        {track.title}
      </Text>
      <Text 
        style={[styles.artist, { fontSize: getArtistFontSize() }]} 
        numberOfLines={1}
      >
        {track.subtitle || '共修音乐'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  artworkPlaceholder: {
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  artist: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  noTrackText: {
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 20,
  },
});

export default TrackInfo;