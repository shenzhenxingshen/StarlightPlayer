import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from './constants/colors';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, View, Text, StyleSheet, Image, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import TrackPlayer, { Capability } from 'react-native-track-player';
import PlayerScreen from './screens/PlayerScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import ProfileScreen from './screens/ProfileScreen';
import { TRACKS } from './constants/tracks';
import { msToSeconds } from './utils/syncUtils';
import { getLocalAudioUrl } from './utils/getLocalAudioUrl';

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
            await TrackPlayer.setupPlayer({ minBuffer: 5, maxBuffer: 50 });
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
        await TrackPlayer.add(
          TRACKS.map(t => ({
            id: t.id,
            url: getLocalAudioUrl(t.audioUrl),
            title: t.title,
            artist: t.subtitle || '',
            artwork: require('./assets/images/vinyl-cover.png'),
            duration: msToSeconds(t.durationMs || 0),
          }))
        );
        // Android 13+ 通知权限
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
        }
        const elapsed = Date.now() - startTime;
        const minSplash = 300;
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
        <Text style={{ color: '#ff6b6b', padding: 20 }}>初始化失败: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={st.center}>
        <Image source={require('./assets/images/splash.png')} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#121212" translucent={true} />
      <NavigationContainer
        theme={{ dark: true, colors: { primary: GOLD, background: '#121212', card: '#121212', text: '#fff', border: '#333', notification: GOLD } }}>
        <Tab.Navigator
          initialRouteName="Player"
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: '#121212', borderTopColor: '#333', height: 72, paddingBottom: 10, paddingTop: 6 },
            tabBarActiveTintColor: GOLD,
            tabBarInactiveTintColor: '#888',
            tabBarLabelStyle: { fontSize: 14 },
            tabBarIconStyle: { marginBottom: -2 },
          }}>
          <Tab.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              title: '播放',
              tabBarIcon: ({ color }) => <Icon name="play-circle-outline" size={38} color={color} />,
            }}
          />
          <Tab.Screen
            name="Playlist"
            component={PlaylistScreen}
            options={{
              title: '列表',
              tabBarIcon: ({ color }) => <Icon name="queue-music" size={38} color={color} />,
            }}
          />
          <Tab.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              title: '我的',
              tabBarIcon: ({ color }) => <Icon name="person" size={38} color={color} />,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const st = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  splash: { width: '80%', height: '60%' },
  verse: { color: GOLD_DIM, fontSize: 20, letterSpacing: 6, lineHeight: 38 },
});

export default App;
