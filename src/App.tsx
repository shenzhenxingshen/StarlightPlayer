import './utils/logger'; // 最先加载，拦截全局错误
import { GOLD, GOLD_DIM, BG_GROUND, BG_SURFACE, BORDER_STRONG, TEXT_TER } from './constants/colors';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  StatusBar,
  View,
  Text,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import PlayerScreen from './screens/PlayerScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import ProfileScreen from './screens/ProfileScreen';
import { replaceTrackInCommand } from './utils/trackManager';
import {
  getSettings,
  discardPendingTrackChange,
  ensurePlaybackTask,
  loadCurrentTrack,
  loadPlayerState,
  loadSessionCount,
  saveCurrentTrack,
  saveCycleEligible,
  saveExpectedPlaying,
  savePlayerState,
  saveSessionCount,
  resetPlaybackTask,
} from './utils/storage';
import { useSettingsStore } from './store/settingsStore';
import { enqueuePlayerCommand } from './utils/playerCommandQueue';
import { buildPlayerOptions } from './utils/playerOptions';
import { TRACKS } from './constants/tracks';
import { addLog } from './utils/logger';
import { isNearCycleStart } from './utils/playbackCycle';
import { shouldRestoreExpectedPlaying } from './utils/playbackDecision';
import { getPlayerLayout } from './utils/playerLayout';

const Tab = createBottomTabNavigator();

let _initialized = false;
let _initializing = false;

function isAlreadyInitialized(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return (
    candidate?.code === 'player_already_initialized' ||
    candidate?.message?.includes('already been initialized') === true
  );
}

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_initialized) {
      setReady(true);
      return;
    }
    if (_initializing) return;
    _initializing = true;
    const startTime = Date.now();

    (async () => {
      try {
        // Android 需要 APP 在前台才能 setupPlayer，加重试
        for (let i = 0; i < 5; i++) {
          try {
            await enqueuePlayerCommand('App:setupPlayer', () =>
              TrackPlayer.setupPlayer({
                minBuffer: 5,
                maxBuffer: 50,
                autoHandleInterruptions: false,
              }),
            );
            break;
          } catch (e) {
            if (isAlreadyInitialized(e)) {
              addLog('INFO', 'setupPlayer: reusing existing native player');
              break;
            }
            if (i === 4) throw e;
            await new Promise(r => setTimeout(r, 500));
          }
        }
        const saved = loadPlayerState();
        const persistedTrackIndex = TRACKS.findIndex(track => track.id === loadCurrentTrack()?.id);
        const initialIdx =
          persistedTrackIndex >= 0
            ? persistedTrackIndex
            : saved?.trackIndex != null && saved.trackIndex >= 0
              ? saved.trackIndex
              : 0;
        await enqueuePlayerCommand('App:initializePlayer', async () => {
          const settings = getSettings();
          await TrackPlayer.updateOptions(buildPlayerOptions(settings));
          await TrackPlayer.setRepeatMode(RepeatMode.Off);
          discardPendingTrackChange();

          // Android 杀 UI 后 Service 可继续播放；重进 App 时优先接管原生队列，不 reset。
          const activeTrack = await TrackPlayer.getActiveTrack();
          const activeIndex = TRACKS.findIndex(track => track.id === String(activeTrack?.id));
          if (activeIndex >= 0) {
            const persistedTrack = loadCurrentTrack();
            if (persistedTrack?.id !== TRACKS[activeIndex].id) {
              const progress = await TrackPlayer.getProgress();
              saveSessionCount(0);
              resetPlaybackTask(TRACKS[activeIndex].id);
              saveCycleEligible(isNearCycleStart(progress.position));
              addLog(
                'WARN',
                `initializePlayer: native track differs from persisted ${persistedTrack?.id ?? 'none'}→${TRACKS[activeIndex].id}`,
              );
            } else {
              ensurePlaybackTask(TRACKS[activeIndex].id, loadSessionCount());
            }
            saveCurrentTrack({ id: TRACKS[activeIndex].id, index: activeIndex });
            savePlayerState({
              trackIndex: activeIndex,
              playMode: saved?.playMode ?? 'repeat-one',
            });
          } else {
            await replaceTrackInCommand(initialIdx, 'restore');
          }

          const playback = await TrackPlayer.getPlaybackState();
          saveExpectedPlaying(shouldRestoreExpectedPlaying(activeIndex >= 0, playback.state));
        });
        // Android 13+ 通知权限
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
            () => {},
          );
        }
        const elapsed = Date.now() - startTime;
        const minSplash = 500;
        if (elapsed < minSplash) {
          await new Promise(r => setTimeout(r, minSplash - elapsed));
        }
        setReady(true);
        _initialized = true;
        _initializing = false;
      } catch (e) {
        _initializing = false;
        setError(String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={st.center}>
        <Text style={{ color: '#C45B4F', padding: 20 }}>初始化失败: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={st.center}>
        {['当勤精进', '慎勿放逸', '都摄六根', '净念相继'].map(line => (
          <Text key={line} style={st.verse}>
            {line}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={BG_GROUND} translucent={true} />
      <NavigationContainer
        theme={{
          dark: false,
          colors: {
            primary: GOLD,
            background: BG_GROUND,
            card: BG_SURFACE,
            text: '#2C2820',
            border: BORDER_STRONG,
            notification: GOLD,
          },
        }}>
        <AppTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const AppTabs: React.FC = () => {
  const { isCareMode } = useSettingsStore();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = getPlayerLayout(width, height, isCareMode);
  const tabBarHeight = layout.tabBarHeight + insets.bottom;
  const tabBarPaddingBottom = Math.max(layout.tabBarPaddingBottom, insets.bottom);
  return (
    <Tab.Navigator
      initialRouteName="Player"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: BG_SURFACE,
          borderTopColor: BORDER_STRONG,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: layout.tabBarPaddingTop,
        },
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: TEXT_TER,
        tabBarLabelStyle: { fontSize: layout.tabLabelSize },
        tabBarIconStyle: { marginBottom: -2 },
        tabBarHideOnKeyboard: true,
      }}>
      <Tab.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          title: '播放',
          tabBarIcon: ({ color }) => (
            <Icon name="play-circle-outline" size={layout.tabIconSize} color={color} />
          ),
        }}
      />
      {!isCareMode && (
        <Tab.Screen
          name="Playlist"
          component={PlaylistScreen}
          options={{
            title: '列表',
            tabBarIcon: ({ color }) => (
              <Icon name="queue-music" size={layout.tabIconSize} color={color} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => <Icon name="person" size={layout.tabIconSize} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

const st = StyleSheet.create({
  center: { flex: 1, backgroundColor: BG_GROUND, alignItems: 'center', justifyContent: 'center' },
  verse: { color: GOLD_DIM, fontSize: 20, letterSpacing: 6, lineHeight: 38 },
});

export default App;
