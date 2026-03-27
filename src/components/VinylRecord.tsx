import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from '../constants/colors';
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface VinylRecordProps {
  isPlaying: boolean;
  size?: number;
}

const VinylRecord: React.FC<VinylRecordProps> = ({ isPlaying, size = 230 }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.2)).current;
  const spinAnim = useRef<Animated.CompositeAnimation | null>(null);
  const glowAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      spinAnim.current = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }),
      );
      spinAnim.current.start();
      glowAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.7, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.2, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      glowAnim.current.start();
    } else {
      spinAnim.current?.stop();
      glowAnim.current?.stop();
      glow.setValue(0.2);
    }
  }, [isPlaying]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = size / 2;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.disc, {
        width: size, height: size, borderRadius: r, transform: [{ rotate }],
      }]}>
        {[0.9, 0.78, 0.66, 0.54].map((s, i) => (
          <View key={i} style={{
            position: 'absolute', width: size * s, height: size * s, borderRadius: (size * s) / 2,
            borderWidth: 0.5, borderColor: i % 2 === 0 ? 'rgba(255,255,255,0.06)' : GOLD_SUBTLE,
          }} />
        ))}
        <View style={[styles.label, { width: size * 0.28, height: size * 0.28, borderRadius: (size * 0.28) / 2 }]}>
          <View style={[styles.labelHole, { width: size * 0.06, height: size * 0.06, borderRadius: (size * 0.06) / 2 }]} />
        </View>
      </Animated.View>
      {/* 呼吸光晕叠在唱片上，绝对定位居中 */}
      <Animated.View style={{
        position: 'absolute',
        width: size + 16, height: size + 16, borderRadius: (size + 16) / 2,
        borderWidth: 2.5, borderColor: GOLD_GLOW,
        opacity: glow,
      }} />
    </View>
  );
};

const styles = StyleSheet.create({
  glowRing: { position: 'absolute', borderWidth: 2.5, borderColor: GOLD_GLOW },
  disc: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#2a2a2a', elevation: 6 },
  label: { backgroundColor: '#8B6914', alignItems: 'center', justifyContent: 'center' },
  labelHole: { backgroundColor: '#222' },
});

export default VinylRecord;
