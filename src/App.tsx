import './utils/logger'; // 最先加载，拦截全局错误
import { GOLD, GOLD_DIM, BG_GROUND, BG_SURFACE, BORDER_STRONG, TEXT_TER } from './constants/colors';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, View, Text, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import TrackPlayer, { Capability } from 'react-native-track-player';
import PlayerScreen from './screens/PlayerScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import ProfileScreen from './screens/ProfileScreen';
import { loadTrack } from './utils/trackManager';
import { useSettingsStore } from './store/settingsStore';

const Tab = createBottomTabNavigator();

let _initialized = false;
let _initializing = false;

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_initialized) { setReady(true); return; }
    if (_initializing) return;
    _initializing = true;
    const startTime = Date.now();

    (async () => {
      try {
        // Android 需要 APP 在前台才能 setupPlayer，加重试
        for (let i = 0; i < 5; i++) {
          try {
            await TrackPlayer.setupPlayer({ minBuffer: 5, maxBuffer: 50, autoHandleInterruptions: false });
            break;
          } catch (e) {
            if (i === 4) throw e;
            await new Promise(r => setTimeout(r, 500));
          }
        }
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play, Capability.Pause,
            Capability.SkipToNext, Capability.SkipToPrevious,
            Capability.SeekTo, Capability.Stop,
          ],
          compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToPrevious, Capability.SkipToNext],
          progressUpdateEventInterval: 1,
        });
        await loadTrack(0);
        // Android 13+ 通知权限
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
        }
        const elapsed = Date.now() - startTime;
        const minSplash = 500;
        if (elapsed < minSplash) {
          await new Promise(r => setTimeout(r, minSplash - elapsed));
        }
        setReady(true);
        _initialized = true;
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
          <Text key={line} style={st.verse}>{line}</Text>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={BG_GROUND} translucent={true} />
      <NavigationContainer
        theme={{ dark: false, colors: { primary: GOLD, background: BG_GROUND, card: BG_SURFACE, text: '#2C2820', border: BORDER_STRONG, notification: GOLD } }}>
        <AppTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const AppTabs: React.FC = () => {
  const { isCareMode } = useSettingsStore();
  return (
        <Tab.Navigator
          initialRouteName="Player"
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: BG_SURFACE, borderTopColor: BORDER_STRONG, height: 72, paddingBottom: 10, paddingTop: 6 },
            tabBarActiveTintColor: GOLD,
            tabBarInactiveTintColor: TEXT_TER,
            tabBarLabelStyle: { fontSize: 14 },
            tabBarIconStyle: { marginBottom: -2 },
          }}>
          <Tab.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              title: '播放',
              tabBarIcon: ({ color }) => <Icon name="play-circle-outline" size={32} color={color} />,
            }}
          />
          {!isCareMode && (
            <Tab.Screen
              name="Playlist"
              component={PlaylistScreen}
              options={{
                title: '列表',
                tabBarIcon: ({ color }) => <Icon name="queue-music" size={32} color={color} />,
              }}
            />
          )}
          <Tab.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              title: '我的',
              tabBarIcon: ({ color }) => <Icon name="person" size={32} color={color} />,
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
