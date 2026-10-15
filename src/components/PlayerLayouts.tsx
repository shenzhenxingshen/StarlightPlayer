import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BG_SURFACE, GOLD, GOLD_BORDER } from '../constants/colors';
import { Track } from '../types';
import { PlayerLayoutTokens } from '../utils/playerLayout';
import Controls, { ControlsProps } from './Controls';
import ProgressBar, { ProgressBarProps } from './ProgressBar';
import TrackInfo from './TrackInfo';

export interface PlayerLayoutProps {
  layout: PlayerLayoutTokens;
  track: Track | null;
  isPlaying: boolean;
  isCareMode: boolean;
  progressProps: ProgressBarProps;
  controlsProps: ControlsProps;
}

const ModeToast: React.FC<{ label: string | null; hidden: boolean }> = ({ label, hidden }) => {
  if (!label || hidden) return null;
  return (
    <View testID="mode-toast" style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{label}</Text>
    </View>
  );
};

function controlSizes(layout: PlayerLayoutTokens) {
  return {
    playButton: layout.playButtonSize,
    playIcon: layout.playIconSize,
    skipIcon: layout.sideIconSize,
    functionIcon: layout.functionIconSize,
  };
}

export const PortraitPlayerLayout: React.FC<PlayerLayoutProps> = ({
  layout,
  track,
  isPlaying,
  isCareMode,
  progressProps,
  controlsProps,
}) => (
  <View testID="player-layout-portrait" style={styles.portraitRoot}>
    <View style={styles.portraitAlbumArea}>
      <TrackInfo
        track={track}
        isPlaying={isPlaying}
        isCareMode={isCareMode}
        variant="stacked"
        vinylSize={layout.vinylSize}
        titleFontSize={layout.titleFontSize}
      />
    </View>
    <View style={styles.portraitProgressArea}>
      <ProgressBar {...progressProps} orientation="horizontal" />
    </View>
    <View style={[styles.portraitControlsArea, { paddingTop: layout.contentGap / 2 }]}>
      <Controls
        {...controlsProps}
        orientation="row"
        height={layout.controlRowHeight}
        sizes={controlSizes(layout)}
        modeLabelPlacement="external"
      />
    </View>
    <ModeToast label={controlsProps.modeLabel} hidden={isCareMode} />
  </View>
);

export const WidePlayerLayout: React.FC<PlayerLayoutProps> = ({
  layout,
  track,
  isPlaying,
  isCareMode,
  progressProps,
  controlsProps,
}) => (
  <View
    testID={`player-layout-${layout.mode}`}
    style={[styles.wideRoot, { maxWidth: layout.contentMaxWidth }]}>
    <View testID="left-side-slot" style={[styles.sideSlot, { width: layout.sideSlot }]}>
      <Controls
        {...controlsProps}
        orientation="rail"
        sizes={controlSizes(layout)}
        modeLabelPlacement="external"
      />
    </View>
    <View style={[styles.centerStage, { marginHorizontal: layout.contentGap }]}>
      <TrackInfo
        track={track}
        isPlaying={isPlaying}
        isCareMode={isCareMode}
        variant="stage"
        vinylSize={layout.vinylSize}
        titleFontSize={layout.titleFontSize}
      />
    </View>
    <View testID="right-side-slot" style={[styles.sideSlot, { width: layout.sideSlot }]}>
      <ProgressBar {...progressProps} orientation="vertical" />
    </View>
    <ModeToast label={controlsProps.modeLabel} hidden={isCareMode} />
  </View>
);

const styles = StyleSheet.create({
  portraitRoot: {
    flex: 1,
    minHeight: 0,
  },
  portraitAlbumArea: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  portraitProgressArea: {
    flexShrink: 0,
    paddingBottom: 2,
  },
  portraitControlsArea: {
    flexShrink: 0,
    paddingBottom: 8,
  },
  wideRoot: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  sideSlot: {
    height: '100%',
    minHeight: 0,
    flexShrink: 0,
  },
  centerStage: {
    flex: 1,
    minWidth: 0,
    height: '100%',
  },
  toast: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  toastText: {
    color: GOLD,
    fontSize: 14,
    backgroundColor: BG_SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    overflow: 'hidden',
  },
});
