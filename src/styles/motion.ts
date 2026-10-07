/**
 * Motion vocabulary: the only transition/animation class strings components should use.
 * Animated properties are limited to color, background-color, border-color, opacity,
 * transform and box-shadow (Disclosure additionally animates grid-template-rows, and the
 * player's side panel and the tab highlight animate width so they move as one piece).
 * Durations and easings come from the tokens in tailwind.config.js.
 */
export const MOTION = {
  colors: 'transition-colors duration-fast ease-standard',
  surface: 'transition-[background-color,border-color,box-shadow] duration-base ease-standard',
  fade: 'transition-opacity duration-base ease-standard',
  lift: 'transition-[transform,box-shadow] duration-fast ease-standard',
  /** The selected-option highlight gliding between tabs: position and width */
  slide: 'transition-[transform,width] duration-base ease-standard',
  /** A side panel sliding open or shut: width and opacity together */
  panel: 'transition-[width,opacity] duration-slow ease-standard',
  enter: 'animate-rise-in',
  enterFade: 'animate-fade-in',
  /** Page change: opacity only, so nothing grows, shifts or overflows (no scrollbar flash) */
  page: 'animate-fade-in-slow',
} as const
