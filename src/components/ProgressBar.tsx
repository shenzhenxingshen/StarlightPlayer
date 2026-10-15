import { GOLD, GOLD_DIM, GOLD_GLOW, BG_RECESS, TEXT_SEC } from '../constants/colors';
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  AccessibilityActionEvent,
} from 'react-native';
import { formatRepeatCount } from '../utils/numberFormat';

export type ProgressOrientation = 'horizontal' | 'vertical';

export interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (value: number) => void;
  isCareMode?: boolean;
  currentRepeat?: number;
  totalRepeat?: number;
  seekable?: boolean;
  orientation?: ProgressOrientation;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function formatPlaybackTime(seconds: number): string {
  const safe = finiteOrZero(seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

interface RepeatNumberProps {
  kind: 'current' | 'total';
  value: number;
  vertical?: boolean;
}

const RepeatNumber: React.FC<RepeatNumberProps> = ({ kind, value, vertical = false }) => {
  const current = kind === 'current';
  return (
    <Text
      testID={`${kind}-repeat`}
      accessibilityLabel={`${current ? '当前遍数' : '每首重复遍数'}：${formatRepeatCount(value)}`}
      style={[
        current ? styles.currentRepeatText : styles.totalRepeatText,
        vertical && styles.verticalRepeatText,
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={vertical ? 0.35 : 0.6}>
      {formatRepeatCount(value)}
    </Text>
  );
};

const ProgressBar: React.FC<ProgressBarProps> = ({
  position,
  duration,
  onSeek,
  isCareMode = false,
  currentRepeat,
  totalRepeat,
  seekable = false,
  orientation = 'horizontal',
}) => {
  const [dragPreview, setDragPreview] = useState<{
    orientation: ProgressOrientation;
    position: number;
  } | null>(null);
  const safeDuration = finiteOrZero(duration);
  const dragPosition = dragPreview?.orientation === orientation ? dragPreview.position : null;
  const displayedPosition = dragPosition ?? finiteOrZero(position);
  const progress =
    safeDuration > 0 ? Math.max(0, Math.min(displayedPosition / safeDuration, 1)) : 0;
  const axisLength = useRef(0);
  const orientationRef = useRef(orientation);
  const seekableRef = useRef(seekable);
  const durationRef = useRef(safeDuration);
  const onSeekRef = useRef(onSeek);
  const pendingSeekRef = useRef<number | null>(null);

  if (orientationRef.current !== orientation) {
    orientationRef.current = orientation;
    axisLength.current = 0;
    pendingSeekRef.current = null;
  }
  seekableRef.current = seekable;
  durationRef.current = safeDuration;
  onSeekRef.current = onSeek;

  const positionFromEvent = (locationX: number, locationY: number): number | null => {
    const length = axisLength.current;
    if (!seekableRef.current || durationRef.current <= 0 || length <= 0) return null;
    const coordinate = orientationRef.current === 'vertical' ? locationY : locationX;
    return Math.max(0, Math.min(1, coordinate / length)) * durationRef.current;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        seekableRef.current && durationRef.current > 0 && axisLength.current > 0,
      onMoveShouldSetPanResponder: () =>
        seekableRef.current && durationRef.current > 0 && axisLength.current > 0,
      onPanResponderGrant: event => {
        const next = positionFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY);
        if (next == null) return;
        pendingSeekRef.current = next;
        setDragPreview({ orientation: orientationRef.current, position: next });
      },
      onPanResponderMove: event => {
        const next = positionFromEvent(event.nativeEvent.locationX, event.nativeEvent.locationY);
        if (next == null) return;
        pendingSeekRef.current = next;
        setDragPreview({ orientation: orientationRef.current, position: next });
      },
      onPanResponderRelease: () => {
        const next = pendingSeekRef.current;
        pendingSeekRef.current = null;
        setDragPreview(null);
        if (next != null && seekableRef.current && durationRef.current > 0) {
          onSeekRef.current(Math.min(next, durationRef.current));
        }
      },
      onPanResponderTerminate: () => {
        pendingSeekRef.current = null;
        setDragPreview(null);
      },
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    axisLength.current =
      orientationRef.current === 'vertical'
        ? event.nativeEvent.layout.height
        : event.nativeEvent.layout.width;
  };

  const showCurrent = !isCareMode && currentRepeat != null;
  const showTotal = !isCareMode && totalRepeat != null;
  const fillPercent = `${progress * 100}%` as `${number}%`;
  const thumbPercent = `${progress * 100}%` as `${number}%`;
  const canAdjust = seekable && safeDuration > 0;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (actionName !== 'increment' && actionName !== 'decrement') return;

    const step = Math.max(safeDuration * 0.05, 1);
    const currentPosition = Math.min(finiteOrZero(position), safeDuration);
    const direction = actionName === 'increment' ? 1 : -1;
    const nextPosition = Math.max(0, Math.min(currentPosition + direction * step, safeDuration));
    if (nextPosition !== currentPosition) {
      onSeekRef.current(nextPosition);
    }
  };
  const commonAccessibility = {
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: seekable ? '播放进度，可拖动' : '播放进度，已锁定',
    accessibilityValue: {
      min: 0,
      max: safeDuration,
      now: Math.min(displayedPosition, safeDuration),
      text: `${formatPlaybackTime(displayedPosition)} / ${formatPlaybackTime(safeDuration)}`,
    },
    accessibilityActions: canAdjust
      ? ([{ name: 'increment' }, { name: 'decrement' }] as const)
      : undefined,
    onAccessibilityAction: canAdjust ? onAccessibilityAction : undefined,
  };

  if (orientation === 'vertical') {
    return (
      <View testID="progress-vertical" style={styles.verticalContainer}>
        <View testID="repeat-stack" style={styles.repeatStack}>
          {showCurrent && <RepeatNumber kind="current" value={currentRepeat} vertical />}
          {showTotal && <RepeatNumber kind="total" value={totalRepeat} vertical />}
        </View>
        <View style={styles.verticalAxisColumn}>
          <Text testID="current-time" style={styles.verticalTime} numberOfLines={1}>
            {formatPlaybackTime(displayedPosition)}
          </Text>
          <View
            testID="progress-seek-area"
            style={styles.verticalBarWrap}
            {...commonAccessibility}
            {...panResponder.panHandlers}
            onLayout={onLayout}>
            <View style={[styles.verticalTrack, seekable && styles.verticalTrackSeekable]}>
              <View
                testID="progress-fill"
                style={[
                  styles.verticalFill,
                  { height: fillPercent },
                  seekable && styles.verticalFillSeekable,
                ]}
              />
              {progress > 0 && (
                <View
                  style={[
                    styles.verticalThumb,
                    { top: thumbPercent },
                    seekable
                      ? [styles.thumbSeekable, styles.verticalThumbSeekable]
                      : styles.thumbLocked,
                  ]}
                />
              )}
            </View>
          </View>
          <Text testID="duration-time" style={styles.verticalTime} numberOfLines={1}>
            {formatPlaybackTime(safeDuration)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View testID="progress-horizontal" style={styles.horizontalContainer}>
      {showCurrent && <RepeatNumber kind="current" value={currentRepeat} />}
      <View
        testID="progress-seek-area"
        style={styles.horizontalBarWrap}
        {...commonAccessibility}
        {...panResponder.panHandlers}
        onLayout={onLayout}>
        <View style={[styles.horizontalTrack, seekable && styles.horizontalTrackSeekable]}>
          <View
            testID="progress-fill"
            style={[
              styles.horizontalFill,
              { width: fillPercent },
              seekable && styles.horizontalFillSeekable,
            ]}
          />
          {progress > 0 && (
            <View
              style={[
                styles.horizontalThumb,
                { left: thumbPercent },
                seekable
                  ? [styles.thumbSeekable, styles.horizontalThumbSeekable]
                  : styles.thumbLocked,
              ]}
            />
          )}
        </View>
      </View>
      <View style={styles.infoRow}>
        <View style={styles.infoCellLeft}>
          <Text testID="current-time" style={styles.time} numberOfLines={1}>
            {formatPlaybackTime(displayedPosition)}
          </Text>
        </View>
        <View style={styles.infoCellCenter}>
          {showTotal && <RepeatNumber kind="total" value={totalRepeat} />}
        </View>
        <View style={styles.infoCellRight}>
          <Text testID="duration-time" style={styles.time} numberOfLines={1}>
            {formatPlaybackTime(safeDuration)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  horizontalContainer: {
    paddingHorizontal: 30,
    paddingVertical: 4,
  },
  currentRepeatText: {
    color: GOLD,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  totalRepeatText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  horizontalBarWrap: {
    paddingVertical: 8,
  },
  horizontalTrack: {
    height: 3,
    backgroundColor: BG_RECESS,
    borderRadius: 2,
  },
  horizontalTrackSeekable: {
    height: 6,
    borderRadius: 3,
  },
  horizontalFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: GOLD_DIM,
    borderRadius: 2,
  },
  horizontalFillSeekable: {
    backgroundColor: GOLD,
    borderRadius: 3,
  },
  horizontalThumb: {
    position: 'absolute',
    marginLeft: -4,
    top: -2.5,
  },
  horizontalThumbSeekable: {
    marginLeft: -8,
    top: -5,
  },
  thumbLocked: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD_DIM,
  },
  thumbSeekable: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GOLD,
    borderWidth: 2,
    borderColor: GOLD_GLOW,
  },
  infoRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoCellLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  infoCellCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCellRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  time: {
    color: TEXT_SEC,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  verticalContainer: {
    width: '100%',
    height: '100%',
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  repeatStack: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  verticalRepeatText: {
    width: '100%',
    marginVertical: 4,
  },
  verticalAxisColumn: {
    width: 48,
    height: '100%',
    alignItems: 'center',
  },
  verticalTime: {
    width: 48,
    color: TEXT_SEC,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  verticalBarWrap: {
    flex: 1,
    width: 44,
    minHeight: 0,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  verticalTrack: {
    width: 3,
    height: '100%',
    backgroundColor: BG_RECESS,
    borderRadius: 2,
  },
  verticalTrackSeekable: {
    width: 6,
    borderRadius: 3,
  },
  verticalFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: GOLD_DIM,
    borderRadius: 2,
  },
  verticalFillSeekable: {
    backgroundColor: GOLD,
    borderRadius: 3,
  },
  verticalThumb: {
    position: 'absolute',
    left: -2.5,
    marginTop: -4,
  },
  verticalThumbSeekable: {
    left: -5,
    marginTop: -8,
  },
});

export default ProgressBar;
