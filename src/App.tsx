import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PlayerScreen from './screens/PlayerScreen';
import PlaylistScreen from './screens/PlaylistScreen';
import ProfileScreen from './screens/ProfileScreen';

const Stack = createNativeStackNavigator();

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Playlist"
          screenOptions={{
            headerStyle: { backgroundColor: '#121212' },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        >
          <Stack.Screen 
            name="Playlist" 
            component={PlaylistScreen}
            options={{ title: '播放列表' }}
          />
          <Stack.Screen 
            name="Player" 
            component={PlayerScreen}
            options={{ title: '正在播放' }}
          />
          <Stack.Screen 
            name="Profile" 
            component={ProfileScreen}
            options={{ title: '我的' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;