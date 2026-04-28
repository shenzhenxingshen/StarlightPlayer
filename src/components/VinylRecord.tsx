import { GOLD_GLOW } from '../constants/colors';
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

  // 沟槽：多圈同心圆模拟黑胶纹路
  const grooves = [0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.46, 0.42];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.disc, {
        width: size, height: size, borderRadius: r, transform: [{ rotate }],
      }]}>
        {/* 黑胶沟槽 */}
        {grooves.map((s, i) => (
          <View key={i} style={{
            position: 'absolute', width: size * s, height: size * s, borderRadius: (size * s) / 2,
            borderWidth: i % 3 === 0 ? 0.8 : 0.4,
            borderColor: i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)',
          }} />
        ))}
        {/* 反光带：模拟光线在黑胶表面的反射 */}
        <View style={{
          position: 'absolute', width: size * 0.88, height: size * 0.88, borderRadius: (size * 0.88) / 2,
          borderWidth: 1.5, borderColor: 'transparent',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderRightColor: 'rgba(255,255,255,0.04)',
        }} />
        {/* 中心标签 */}
        <View style={[styles.label, { width: size * 0.32, height: size * 0.32, borderRadius: (size * 0.32) / 2 }]}>
          {/* 标签纹理：同心圆装饰 */}
          <View style={{
            position: 'absolute', width: size * 0.28, height: size * 0.28, borderRadius: (size * 0.28) / 2,
            borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
          }} />
          <View style={{
            position: 'absolute', width: size * 0.22, height: size * 0.22, borderRadius: (size * 0.22) / 2,
            borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)',
          }} />
          {/* 主轴孔 */}
          <View style={[styles.labelHole, { width: size * 0.05, height: size * 0.05, borderRadius: (size * 0.05) / 2 }]} />
        </View>
        {/* 标签边缘凸起 */}
        <View style={{
          position: 'absolute', width: size * 0.33, height: size * 0.33, borderRadius: (size * 0.33) / 2,
          borderWidth: 1, borderColor: 'rgba(80,60,20,0.4)',
        }} />
      </Animated.View>
      {/* 呼吸光晕 */}
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
  disc: {
    backgroundColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#333',
    elevation: 8,
    // iOS 阴影
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  label: {
    backgroundColor: '#6B4C1A', // 深棕色纸质标签
    alignItems: 'center', justifyContent: 'center',
  },
  labelHole: {
    backgroundColor: '#333', // 金属主轴孔
    borderWidth: 1, borderColor: '#555',
  },
});

export default VinylRecord;
