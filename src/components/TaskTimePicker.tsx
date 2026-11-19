import React, { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BG_RECESS, BG_SURFACE, BORDER, GOLD, INK, TEXT_TER } from '../constants/colors';

type Clock = { hour: number; minute: number; second: number };
type Part = keyof Clock;
const PARTS = [
  ['hour', '时', 24],
  ['minute', '分', 60],
  ['second', '秒', 60],
] as const;

/** Independent circular wheels. Seconds/minutes wrap without carrying into other columns. */
export default function TaskTimePicker({
  value,
  onChange,
  onScrollingChange,
}: {
  value: Clock;
  onChange: (value: Clock) => void;
  onScrollingChange: (scrolling: boolean) => void;
}) {
  const moving = useRef(new Set<Part>());
  const currentValue = useRef(value);
  currentValue.current = value;
  return (
    <View style={styles.row}>
      {PARTS.map(([part, label, count]) => (
        <TimeWheel
          key={part}
          part={part}
          label={label}
          count={count}
          value={value[part]}
          onChange={next => {
            currentValue.current = { ...currentValue.current, [part]: next };
            onChange(currentValue.current);
          }}
          onMoving={active => {
            if (active) moving.current.add(part);
            else moving.current.delete(part);
            onScrollingChange(moving.current.size > 0);
          }}
        />
      ))}
    </View>
  );
}

function TimeWheel({
  part,
  label,
  count,
  value,
  onChange,
  onMoving,
}: {
  part: Part;
  label: string;
  count: number;
  value: number;
  onChange: (value: number) => void;
  onMoving: (active: boolean) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.ceil(48 * Math.max(1, Math.min(fontScale, 2)));
  const scroll = useRef<ScrollView>(null);
  // Five copies provide room in both directions. Recenter only after settling,
  // so native inertia is not interrupted at 23→00 or 59→00.
  const center = (n: number) => count * 2 + n;
  const wrap = (n: number) => ((n % count) + count) % count;
  const initialOffset = useRef({ x: 0, y: center(value) * rowHeight });
  const offset = useRef(initialOffset.current.y);
  const dragging = useRef(false);
  const moving = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const [selected, setSelected] = useState(value);
  // Event/timer callbacks always use the most recent parent value and handlers.
  const latest = useRef({ value, onChange, onMoving, rowHeight });
  latest.current = { value, onChange, onMoving, rowHeight };
  const clearIdle = () => clearTimeout(idleTimer.current);
  const choose = (n: number) => {
    setSelected(n);
    latest.current.onChange(n);
  };
  const settle = () => {
    clearIdle();
    const height = latest.current.rowHeight;
    const n = wrap(Math.round(offset.current / height));
    offset.current = center(n) * height;
    scroll.current?.scrollTo({ y: offset.current, animated: false });
    choose(n);
    moving.current = false;
    latest.current.onMoving(false);
  };
  const armIdle = () => {
    clearIdle();
    // onMomentumScrollEnd is not emitted after every short drag, especially on Android.
    if (!dragging.current) idleTimer.current = setTimeout(settle, 200);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  useEffect(() => {
    if (!moving.current) {
      setSelected(value);
      offset.current = (count * 2 + value) * rowHeight;
      scroll.current?.scrollTo({ y: offset.current, animated: false });
    }
  }, [value, rowHeight, count]);

  const jump = (n: number) => {
    clearIdle();
    dragging.current = false;
    offset.current = center(wrap(n)) * latest.current.rowHeight;
    settle();
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!moving.current) return;
    offset.current = event.nativeEvent.contentOffset.y;
    choose(wrap(Math.round(offset.current / latest.current.rowHeight)));
    armIdle();
  };
  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`启动${label}`}
        accessibilityHint="上下轻扫调整，首尾循环；也可滑动或点击数字，各列独立不进位"
        accessibilityValue={{ min: 0, max: count - 1, now: selected, text: `${selected}${label}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => {
          const action = event.nativeEvent.actionName;
          if (action === 'increment') jump(latest.current.value + 1);
          if (action === 'decrement') jump(latest.current.value - 1);
        }}
        style={[styles.wheel, { height: rowHeight * 3 }]}>
        <View
          pointerEvents="none"
          style={[styles.selection, { top: rowHeight, height: rowHeight }]}
        />
        <ScrollView
          ref={scroll}
          testID={`task-${part}-wheel`}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          snapToInterval={rowHeight}
          scrollEventThrottle={16}
          contentOffset={initialOffset.current}
          contentContainerStyle={{ paddingVertical: rowHeight }}
          onLayout={() => {
            if (!moving.current)
              scroll.current?.scrollTo({
                y: center(latest.current.value) * rowHeight,
                animated: false,
              });
          }}
          onScrollBeginDrag={() => {
            clearIdle();
            dragging.current = true;
            moving.current = true;
            latest.current.onMoving(true);
          }}
          onScroll={onScroll}
          onScrollEndDrag={event => {
            dragging.current = false;
            offset.current = event.nativeEvent.contentOffset.y;
            armIdle();
          }}
          onMomentumScrollBegin={() => clearIdle()}
          onMomentumScrollEnd={event => {
            if (!moving.current) return;
            offset.current = event.nativeEvent.contentOffset.y;
            settle();
          }}>
          {Array.from({ length: count * 5 }, (_, index) => {
            const n = wrap(index);
            return (
              <Pressable
                key={index}
                accessible={false}
                onPress={() => jump(n)}
                style={[styles.numberRow, { height: rowHeight }]}>
                <Text
                  maxFontSizeMultiplier={2}
                  style={[styles.number, n === selected && styles.selectedNumber]}>
                  {String(n).padStart(2, '0')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  label: { color: TEXT_TER, textAlign: 'center', fontSize: 13, marginBottom: 6 },
  wheel: {
    backgroundColor: BG_SURFACE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  selection: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: BG_RECESS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: GOLD,
  },
  numberRow: { justifyContent: 'center', alignItems: 'center' },
  number: { color: TEXT_TER, fontSize: 24, fontVariant: ['tabular-nums'] },
  selectedNumber: { color: INK, fontWeight: '600' },
});
