import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from '../constants/colors';
import { View, StyleSheet, ScrollView, Text, Switch, TouchableOpacity, Platform, Alert, NativeModules, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';import React, { useState, useCallback } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { TRACKS } from '../constants/tracks';
import { useStatsStore } from '../store/statsStore';
import { useSettingsStore } from '../store/settingsStore';
import { getLogs } from '../utils/logger';

const getDeviceInfo = (): string => {
  const c = Platform.constants as any;
  const lines = [
    `平台: ${Platform.OS}`,
    `系统版本: ${Platform.Version}`,
  ];
  if (Platform.OS === 'android') {
    lines.push(`品牌: ${c.Brand || '未知'}`);
    lines.push(`型号: ${c.Model || '未知'}`);
    lines.push(`制造商: ${c.Manufacturer || '未知'}`);
    lines.push(`指纹: ${c.Fingerprint || '未知'}`);
  } else if (Platform.OS === 'ios') {
    lines.push(`品牌: Apple`);
    lines.push(`型号: ${c.osVersion || Platform.Version}`);
    lines.push(`系统名称: ${c.systemName || 'iOS'}`);
    lines.push(`设备名称: ${c.interfaceIdiom || '未知'}`);
  }
  lines.push(`RN版本: 0.75.5`);
  lines.push(`App版本: 0.5.0`);
  return lines.join('\n');
};

const ProfileScreen: React.FC = () => {
  const [showLogs, setShowLogs] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customRepeatText, setCustomRepeatText] = useState('');
  const { isCareMode, toggleCareMode, isSyncMode, toggleSyncMode, repeatCount, setRepeatCount } = useSettingsStore();
  const stats = useStatsStore(s => s.stats);

  const t = (base: number) => isCareMode ? base + 6 : base;
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
        {/* 关怀模式 */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Icon name="accessibility" size={t(22)} color={GOLD} />
            <View style={styles.cardInfo}>
              <Text style={[styles.cardLabel, { fontSize: t(16) }]}>模式切换</Text>
              <Text style={[styles.cardDesc, { fontSize: t(12) }]}>
                {isCareMode ? '关怀模式：简化界面，避免误操作' : '普通模式：显示全部功能'}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <Pressable
              onPress={toggleCareMode}
              style={{
                backgroundColor: isCareMode ? '#b8860b' : '#333',
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}>
              <Text style={{ color: '#fff', fontSize: t(15), fontWeight: '600' }}>
                {isCareMode ? '切换到普通模式' : '切换到关怀模式'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 同步播放开关 - 关怀模式下隐藏 */}
        {!isCareMode && (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Icon name="sync" size={t(22)} color={GOLD} />
            <View style={styles.cardInfo}>
              <Text style={[styles.cardLabel, { fontSize: t(16) }]}>同步播放</Text>
              <Text style={[styles.cardDesc, { fontSize: t(12) }]}>
                {isSyncMode ? '开启：播放时自动对齐进度（共修模式）' : '关闭：每首歌从头开始播放'}
              </Text>
            </View>
            <Switch
              value={isSyncMode}
              onValueChange={toggleSyncMode}
              trackColor={{ false: '#555', true: '#b8860b' }}
              thumbColor="#fff"
            />
          </View>
        </View>
        )}

        {/* 每首重复遍数 - 关怀模式下隐藏 */}
        {!isCareMode && (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Icon name="repeat" size={t(22)} color={GOLD} />
            <View style={styles.cardInfo}>
              <Text style={[styles.cardLabel, { fontSize: t(16) }]}>每首重复遍数</Text>
              <Text style={[styles.cardDesc, { fontSize: t(12) }]}>当前：{repeatCount} 遍</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 }}>
            {[1, 7, 21, 49, 108].map(n => (
              <Pressable
                key={n}
                onPress={() => setRepeatCount(n)}
                style={{
                  backgroundColor: repeatCount === n ? '#b8860b' : '#333',
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
                }}>
                <Text style={{ color: '#fff', fontSize: t(14), fontWeight: repeatCount === n ? '700' : '400' }}>{n}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => { setShowCustomInput(true); setCustomRepeatText(String(repeatCount)); }}
              style={{ backgroundColor: ![1,7,21,49,108].includes(repeatCount) ? '#b8860b' : '#333', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontSize: t(14) }}>自定义</Text>
            </Pressable>
          </View>
          {showCustomInput && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <TextInput
                value={customRepeatText}
                onChangeText={setCustomRepeatText}
                keyboardType="number-pad"
                style={{ flex: 1, backgroundColor: '#222', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16 }}
                placeholder="输入遍数"
                placeholderTextColor="#666"
              />
              <Pressable
                onPress={() => {
                  const n = parseInt(customRepeatText, 10);
                  if (n >= 1) { setRepeatCount(n); setShowCustomInput(false); }
                }}
                style={{ backgroundColor: '#b8860b', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginLeft: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>确定</Text>
              </Pressable>
            </View>
          )}
        </View>
        )}

        {/* 今日统计 - 暂时隐藏 */}
        {/*
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { fontSize: t(17) }]}>
            <Icon name="bar-chart" size={t(17)} color={GOLD} />  今日播放统计
          </Text>
          {tracksWithStats.length === 0 ? (
            <View style={styles.emptyWrap}>
              {['当勤精进', '慎勿放逸', '都摄六根', '净念相继'].map(line => (
                <Text key={line} style={[styles.emptyLine, { fontSize: t(18) }]}>{line}</Text>
              ))}
            </View>
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
        */}

        {/* 诊断信息 - 关怀模式下隐藏 */}
        {!isCareMode && (
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
                <Icon name="content-copy" size={16} color={GOLD} />
                <Text style={styles.copyText}>复制诊断信息</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        )}

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
  cardTitle: { color: GOLD, fontWeight: 'bold', marginBottom: 12 },
  emptyWrap: { alignItems: 'center', paddingVertical: 16 },
  emptyLine: { color: GOLD_DIM, letterSpacing: 6, lineHeight: 36 },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  statTitle: { color: '#fff', flex: 1, marginRight: 8 },
  badge: { backgroundColor: GOLD_FAINT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: GOLD, fontWeight: '600' },
  logArea: { marginTop: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12 },
  logText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'monospace', lineHeight: 20 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, alignSelf: 'flex-end' },
  copyText: { color: GOLD, fontSize: 13, marginLeft: 6 },
});

export default ProfileScreen;
