import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Text, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TRACKS } from '../constants/tracks';
import { getPlaybackStats } from '../utils/storage';
import { useSettingsStore } from '../store/settingsStore';

const ProfileScreen: React.FC = () => {
  const [stats, setStats] = useState<Record<string, number>>({});
  const { isLargeTextMode, toggleLargeTextMode } = useSettingsStore();

  useEffect(() => {
    setStats(getPlaybackStats());
  }, []);

  const t = (base: number) => isLargeTextMode ? base + 6 : base;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={[styles.header, { fontSize: t(20) }]}>我的</Text>
      <ScrollView style={styles.content}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { fontSize: t(16) }]}>大字模式</Text>
            <Text style={[styles.settingDesc, { fontSize: t(13) }]}>放大文字、按钮和图标</Text>
          </View>
          <Switch
            value={isLargeTextMode}
            onValueChange={toggleLargeTextMode}
            trackColor={{ false: '#767577', true: '#1DB954' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.statsSection}>
          <Text style={[styles.sectionTitle, { fontSize: t(18) }]}>今日播放统计</Text>
          {Object.keys(stats).length === 0 ? (
            <Text style={[styles.emptyText, { fontSize: t(14) }]}>今日暂无播放记录</Text>
          ) : (
            TRACKS.map(track => {
              const count = stats[track.id] || 0;
              if (count === 0) return null;
              return (
                <View key={track.id} style={styles.statItem}>
                  <View style={styles.statInfo}>
                    <Text style={[styles.statTitle, { fontSize: t(15) }]} numberOfLines={1}>{track.title}</Text>
                    <Text style={[styles.statCode, { fontSize: t(13) }]}>{track.code}</Text>
                  </View>
                  <View style={styles.statCount}>
                    <Text style={[styles.statCountText, { fontSize: t(14) }]}>{count} 次</Text>
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
  container: { flex: 1, backgroundColor: '#121212' },
  header: { color: '#fff', fontWeight: 'bold', paddingHorizontal: 20, paddingVertical: 20 },
  content: { flex: 1, paddingHorizontal: 20 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 12, marginBottom: 20 },
  settingInfo: { flex: 1 },
  settingLabel: { color: '#fff', fontWeight: 'bold', marginBottom: 4 },
  settingDesc: { color: 'rgba(255,255,255,0.6)' },
  statsSection: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 12 },
  sectionTitle: { color: '#fff', fontWeight: 'bold', marginBottom: 15 },
  emptyText: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingVertical: 20 },
  statItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  statInfo: { flex: 1 },
  statTitle: { color: '#fff', fontWeight: '500', marginBottom: 2 },
  statCode: { color: 'rgba(255,255,255,0.6)' },
  statCount: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(29,185,84,0.2)', borderRadius: 8 },
  statCountText: { color: '#1DB954', fontWeight: 'bold' },
});

export default ProfileScreen;
