import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface VinylRecordProps {
  isPlaying: boolean;
  size?: number;
}

const VinylRecord: React.FC<VinylRecordProps> = ({ isPlaying, size = 260 }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true }),
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
    }
  }, [isPlaying]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.disc, { width: size, height: size, borderRadius: r, transform: [{ rotate }] }]}>
        {/* 外圈 */}
        <View style={[styles.ring, { width: size, height: size, borderRadius: r }]} />
        {/* 纹路 */}
        {[0.85, 0.7, 0.55].map((s, i) => (
          <View key={i} style={[styles.groove, { width: size * s, height: size * s, borderRadius: (size * s) / 2 }]} />
        ))}
        {/* 中心标签 */}
        <View style={[styles.label, { width: size * 0.35, height: size * 0.35, borderRadius: (size * 0.35) / 2 }]}>
          <View style={[styles.labelInner, { width: size * 0.12, height: size * 0.12, borderRadius: (size * 0.12) / 2 }]} />
        </View>
      </Animated.View>
      {/* 呼吸光晕 */}
      {isPlaying && <View style={[styles.glow, { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2 }]} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  disc: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#333' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)' },
  groove: { position: 'absolute', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
  label: { backgroundColor: '#b8860b', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  labelInner: { backgroundColor: '#1a1a1a' },
  glow: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,215,0,0.2)', zIndex: -1 },
});

export default VinylRecord;
