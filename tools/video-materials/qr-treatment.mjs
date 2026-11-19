// Coordinates reviewed on this exact artwork, not a generic QR-removal filter.
// Source originals and AAC packets are retained unchanged.
export const qrRect = Object.freeze({ x: 684, y: 281, w: 122, h: 122 });
const reviewedSources = {
  regular: '8de7bddfc417ece0f557a53cf2ed68be78030432aa16cebdb462d07b3db51ea0',
  final: '2e63d117aa0cbb30ba37d5f11a91410aa2d9fe5009b0ac5e080e7cfc658ac258',
};
export function qrTreatment(entry) {
  const reviewed = reviewedSources[entry.id];
  if (!reviewed) return null;
  if (entry.sourceSHA256 !== reviewed || entry.width !== 856 || entry.height !== 482)
    throw new Error(`QR coordinates must be re-reviewed for changed source: ${entry.id}`);
  const { x, y, w, h } = qrRect;
  return { rectangle: qrRect, filter: `delogo=x=${x}:y=${y}:w=${w}:h=${h}` };
}
