export type PlayerLayoutMode = 'portrait' | 'square' | 'landscape';

export interface PlayerLayoutTokens {
  mode: PlayerLayoutMode;
  wide: boolean;
  sideSlot: number;
  railHeight: number;
  railHeightMax: number;
  tabBarHeight: number;
  tabBarPaddingTop: number;
  tabBarPaddingBottom: number;
  tabIconSize: number;
  tabLabelSize: number;
  edgePadding: number;
  titleFontSize: number;
  standardPlayButtonSize: number;
  carePlayButtonSize: number;
  playButtonSize: number;
  playIconSize: number;
  sideIconSize: number;
  functionIconSize: number;
  vinylSize: number;
  vinylSizeMax: number;
  controlRowHeight: number;
  contentGap: number;
  contentMaxWidth: number;
}

type NumericLayoutToken = Exclude<keyof PlayerLayoutTokens, 'mode' | 'wide'>;

/**
 * Every numeric layout token is bounded so an unusual window size cannot make
 * a control unusably small or let it grow without limit on a TV-sized screen.
 */
export const PLAYER_LAYOUT_LIMITS: Readonly<
  Record<NumericLayoutToken, readonly [minimum: number, maximum: number]>
> = {
  sideSlot: [80, 176],
  railHeight: [140, 300],
  railHeightMax: [150, 300],
  tabBarHeight: [50, 76],
  tabBarPaddingTop: [4, 8],
  tabBarPaddingBottom: [4, 12],
  tabIconSize: [24, 34],
  tabLabelSize: [10, 15],
  edgePadding: [20, 40],
  titleFontSize: [20, 34],
  standardPlayButtonSize: [58, 88],
  carePlayButtonSize: [76, 152],
  playButtonSize: [58, 152],
  playIconSize: [40, 116],
  sideIconSize: [26, 42],
  functionIconSize: [22, 34],
  vinylSize: [72, 360],
  vinylSizeMax: [96, 360],
  controlRowHeight: [88, 192],
  contentGap: [10, 32],
  contentMaxWidth: [240, 1280],
};

const FALLBACK_VIEWPORT = Object.freeze({ width: 390, height: 844 });

interface Viewport {
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function token(name: NumericLayoutToken, value: number): number {
  const [minimum, maximum] = PLAYER_LAYOUT_LIMITS[name];
  return Math.round(clamp(value, minimum, maximum));
}

function normalizeViewport(width: number, height: number): Viewport {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return FALLBACK_VIEWPORT;
  }
  return { width, height };
}

/**
 * Screen classes use the product definitions verbatim:
 * portrait: height > width
 * square:   height <= width and height / width >= 3 / 4
 * landscape: everything wider
 */
export function classifyPlayerLayout(width: number, height: number): PlayerLayoutMode {
  const viewport = normalizeViewport(width, height);
  if (viewport.height > viewport.width) return 'portrait';
  return viewport.height / viewport.width >= 3 / 4 ? 'square' : 'landscape';
}

/**
 * Calculates shared PlayerScreen/AppTabs measurements without depending on
 * React Native, making rotation and unusual window sizes deterministic.
 */
export function getPlayerLayout(
  width: number,
  height: number,
  isCareMode = false,
): PlayerLayoutTokens {
  const viewport = normalizeViewport(width, height);
  const mode = classifyPlayerLayout(viewport.width, viewport.height);
  const shortSide = Math.min(viewport.width, viewport.height);

  const edgePadding = token(
    'edgePadding',
    shortSide * (mode === 'portrait' ? 0.077 : mode === 'square' ? 0.052 : 0.06),
  );
  const contentGap = token(
    'contentGap',
    shortSide * (mode === 'portrait' ? 0.035 : mode === 'square' ? 0.03 : 0.045),
  );
  const sideSlot = token(
    'sideSlot',
    mode === 'portrait'
      ? shortSide * 0.24
      : mode === 'square'
        ? shortSide * 0.12 + 50
        : shortSide * 0.2 + 55,
  );

  const standardPlayButtonSize = token(
    'standardPlayButtonSize',
    shortSide * (mode === 'portrait' ? 0.22 : mode === 'square' ? 0.1 : 0.16),
  );
  const carePlayButtonSize = token(
    'carePlayButtonSize',
    shortSide * (mode === 'portrait' ? 0.38 : mode === 'square' ? 0.14 : 0.22),
  );
  const playButtonSize = isCareMode ? carePlayButtonSize : standardPlayButtonSize;

  const railHeightMax = token(
    'railHeightMax',
    viewport.height * (mode === 'portrait' ? 0.28 : mode === 'square' ? 0.39 : 0.58),
  );
  const proposedRailHeight = token(
    'railHeight',
    viewport.height * (mode === 'portrait' ? 0.22 : mode === 'square' ? 0.32 : 0.48),
  );
  const railHeight = Math.min(proposedRailHeight, railHeightMax);

  const vinylSizeMax = token(
    'vinylSizeMax',
    shortSide * (mode === 'portrait' ? 0.82 : mode === 'square' ? 0.46 : 0.72),
  );
  const proposedVinylSize = token(
    'vinylSize',
    mode === 'portrait'
      ? Math.min(viewport.width * 0.65, viewport.height * 0.34)
      : mode === 'square'
        ? Math.min(viewport.width * 0.38, viewport.height * 0.45)
        : Math.min(viewport.width * 0.34, viewport.height * 0.55),
  );
  const wideCenterCapacity = Math.max(
    PLAYER_LAYOUT_LIMITS.vinylSize[0],
    viewport.width - edgePadding * 2 - sideSlot * 2 - contentGap * 2 - 8,
  );
  const vinylSize = token(
    'vinylSize',
    Math.min(
      proposedVinylSize,
      vinylSizeMax,
      mode === 'portrait' ? vinylSizeMax : wideCenterCapacity,
    ),
  );

  const tabBarHeight = token(
    'tabBarHeight',
    shortSide * (mode === 'portrait' ? 0.185 : mode === 'square' ? 0.078 : 0.135),
  );
  const contentWidth = viewport.width - edgePadding * 2;

  return {
    mode,
    wide: mode !== 'portrait',
    sideSlot,
    railHeight,
    railHeightMax,
    tabBarHeight,
    tabBarPaddingTop: token('tabBarPaddingTop', mode === 'portrait' ? 6 : 4),
    tabBarPaddingBottom: token('tabBarPaddingBottom', mode === 'portrait' ? 10 : 4),
    tabIconSize: token(
      'tabIconSize',
      shortSide * (mode === 'portrait' ? 0.082 : mode === 'square' ? 0.039 : 0.074),
    ),
    tabLabelSize: token(
      'tabLabelSize',
      shortSide * (mode === 'portrait' ? 0.036 : mode === 'square' ? 0.017 : 0.031),
    ),
    edgePadding,
    titleFontSize: token(
      'titleFontSize',
      shortSide *
        (isCareMode
          ? mode === 'portrait'
            ? 0.072
            : mode === 'square'
              ? 0.044
              : 0.072
          : mode === 'portrait'
            ? 0.056
            : mode === 'square'
              ? 0.035
              : 0.052),
    ),
    standardPlayButtonSize,
    carePlayButtonSize,
    playButtonSize,
    playIconSize: token('playIconSize', playButtonSize * 0.76),
    sideIconSize: token('sideIconSize', standardPlayButtonSize * 0.44),
    functionIconSize: token('functionIconSize', standardPlayButtonSize * 0.34),
    vinylSize,
    vinylSizeMax,
    controlRowHeight: token('controlRowHeight', playButtonSize + (mode === 'portrait' ? 16 : 12)),
    contentGap,
    contentMaxWidth: token(
      'contentMaxWidth',
      Math.min(contentWidth, mode === 'portrait' ? 560 : mode === 'square' ? 1080 : 1280),
    ),
  };
}
