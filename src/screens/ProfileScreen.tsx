import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text, Switch, TouchableOpacity, Platform, Alert, NativeModules } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { TRACKS } from '../constants/tracks';
import { getPlaybackStats } from '../utils/storage';
import { useSettingsStore } from '../store/settingsStore';
import { getLogs } from '../utils/logger';

const getDeviceInfo = (): string => {
  const lines = [
    `平台: ${Platform.OS}`,
    `系统版本: ${Platform.Version}`,
  ];
  if (Platform.OS === 'android') {
    const c = Platform.constants as any;
    lines.push(`品牌: ${c.Brand || '未知'}`);
    lines.push(`型号: ${c.Model || '未知'}`);
    lines.push(`制造商: ${c.Manufacturer || '未知'}`);
    lines.push(`指纹: ${c.Fingerprint || '未知'}`);
  }
  lines.push(`RN版本: 0.75.5`);
  lines.push(`App版本: 0.1.0`);
  return lines.join('\n');
};

const ProfileScreen: React.FC = () => {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [showLogs, setShowLogs] = useState(false);
  const { isLargeTextMode, toggleLargeTextMode } = useSettingsStore();

  useEffect(() => { setStats(getPlaybackStats()); }, []);

  const t = (base: number) => isLargeTextMode ? base + 6 : base;
  const deviceInfo = getDeviceInfo();

  const copyLogs = useCallback(() => {
    const logLines = getLogs();
    const text = `=== 星光播放器 诊断信息 ===\n${deviceInfo}\n时间: ${new Date().toISOString()}\n\n--- 运行日志 (${logLines.length}条) ---\n${logLines.length > 0 ? logLines.join('\n') : '暂无异常日志'}`;
    try {
      const { Clipboard } = NativeModules;
      if (Clipboard) Clipboard.setString(text);
      Alert.alert('已复制', '诊断信息已复制到剪贴板');
    } catch {
      Alert.alert('诊断信息', text);
    }
  }, [deviceInfo]);

  const tracksWithStats = TRACKS.filter(tr => (stats[tr.id] || 0) > 0);
  const totalToday = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.content}>
        {/* 大字模式 */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Icon name="text-fields" size={t(22)} color="#ffd700" />
            <View style={styles.cardInfo}>
              <Text style={[styles.cardLabel, { fontSize: t(16) }]}>大字模式</Text>
              <Text style={[styles.cardDesc, { fontSize: t(12) }]}>放大文字、按钮和图标</Text>
            </View>
            <Switch
              value={isLargeTextMode}
              onValueChange={toggleLargeTextMode}
              trackColor={{ false: '#555', true: '#b8860b' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* 今日统计 */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { fontSize: t(17) }]}>
            <Icon name="bar-chart" size={t(17)} color="#ffd700" />  今日播放统计 ({totalToday} 遍)
          </Text>
          {tracksWithStats.length === 0 ? (
            <Text style={[styles.emptyText, { fontSize: t(14) }]}>今日暂无播放记录</Text>
          ) : (
            tracksWithStats.map(track => (
              <View key={track.id} style={styles.statRow}>
                <Text style={[styles.statTitle, { fontSize: t(14) }]} numberOfLines={1}>{track.title}</Text>
                <View style={styles.badge}>
                  <Text style={[styles.badgeText, { fontSize: t(13) }]}>{stats[track.id]} 遍</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 诊断信息 */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.cardRow} onPress={() => setShowLogs(!showLogs)}>
            <Icon name="bug-report" size={t(22)} color="rgba(255,255,255,0.5)" />
            <View style={styles.cardInfo}>
              <Text style={[styles.cardLabel, { fontSize: t(16) }]}>诊断信息</Text>
              <Text style={[styles.cardDesc, { fontSize: t(12) }]}>遇到问题时提供给开发者</Text>
            </View>
            <Icon name={showLogs ? 'expand-less' : 'expand-more'} size={24} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
          {showLogs && (
            <View style={styles.logArea}>
              <Text style={styles.logText}>{deviceInfo}</Text>
              <Text style={[styles.logText, { marginTop: 8 }]}>--- 运行日志 ---</Text>
              <Text style={styles.logText}>
                {getLogs().length > 0 ? getLogs().slice(-30).join('\n') : '暂无异常日志'}
              </Text>
              <TouchableOpacity style={styles.copyBtn} onPress={copyLogs}>
                <Icon name="content-copy" size={16} color="#ffd700" />
                <Text style={styles.copyText}>复制诊断信息</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardLabel: { color: '#fff', fontWeight: '600' },
  cardDesc: { color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  cardTitle: { color: '#ffd700', fontWeight: 'bold', marginBottom: 12 },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingVertical: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  statTitle: { color: '#fff', flex: 1, marginRight: 8 },
  badge: { backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#ffd700', fontWeight: '600' },
  logArea: { marginTop: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12 },
  logText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'monospace', lineHeight: 20 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, alignSelf: 'flex-end' },
  copyText: { color: '#ffd700', fontSize: 13, marginLeft: 6 },
});

export default ProfileScreen;
