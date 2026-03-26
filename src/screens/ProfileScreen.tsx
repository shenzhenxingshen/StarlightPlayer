import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TRACKS } from '../constants/tracks';
import { getPlaybackStats } from '../utils/storage';
import { toggleLargeTextMode, isLargeTextMode } from '../utils/storage';

const ProfileScreen: React.FC = () => {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [largeTextMode, setLargeTextMode] = useState(false);

  useEffect(() => {
    loadStats();
    setLargeTextMode(isLargeTextMode());
  }, []);

  const loadStats = () => {
    setStats(getPlaybackStats());
  };

  const handleToggleLargeText = () => {
    toggleLargeTextMode();
    setLargeTextMode(isLargeTextMode());
    loadStats();
  };

  const getTextStyle = () => ({
    fontSize: largeTextMode ? 22 : 16,
  });

  const getHeaderStyle = () => ({
    fontSize: largeTextMode ? 28 : 20,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={[styles.header, getHeaderStyle()]}>我的</Text>
      
      <ScrollView style={styles.content}>
        {/* 大字模式开关 */}
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, getTextStyle()]}>大字模式</Text>
            <Text style={[styles.settingDescription, getTextStyle()]}>
              放大文字、按钮和图标，便于阅读和操作
            </Text>
          </View>
          <Switch
            value={largeTextMode}
            onValueChange={handleToggleLargeText}
            trackColor={{ false: '#767577', true: '#1DB954' }}
            thumbColor={largeTextMode ? '#ffffff' : '#f4f3f4'}
          />
        </View>

        {/* 今日播放统计 */}
        <View style={styles.statsSection}>
          <Text style={[styles.sectionTitle, getHeaderStyle()]}>今日播放统计</Text>
          
          {Object.keys(stats).length === 0 ? (
            <Text style={[styles.emptyText, getTextStyle()]}>
              今日暂无播放记录
            </Text>
          ) : (
            TRACKS.map(track => {
              const count = stats[track.id] || 0;
              if (count === 0) return null;

              return (
                <View key={track.id} style={styles.statItem}>
                  <View style={styles.statInfo}>
                    <Text style={[styles.statTitle, getTextStyle()]} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={[styles.statCode, getTextStyle()]}>
                      {track.code}
                    </Text>
                  </View>
                  <View style={styles.statCount}>
                    <Text style={[styles.statCountText, getTextStyle()]}>
                      {count} 次
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
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
    fontWeight: 'bold',
    paddingHorizontal: 20,
    paddingVertical: 20,
    fontSize: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  settingDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  statsSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 15,
    fontSize: 18,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    paddingVertical: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  statInfo: {
    flex: 1,
  },
  statTitle: {
    color: '#ffffff',
    fontWeight: '500',
    marginBottom: 2,
  },
  statCode: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  statCount: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(29, 185, 84, 0.2)',
    borderRadius: 8,
  },
  statCountText: {
    color: '#1DB954',
    fontWeight: 'bold',
  },
});

export default ProfileScreen;