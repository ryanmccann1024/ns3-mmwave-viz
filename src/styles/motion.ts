/**
 * Motion vocabulary: the only transition/animation class strings components should use.
 * Animated properties are limited to color, background-color, border-color, opacity,
 * transform and box-shadow (Disclosure additionally animates grid-template-rows).
 * Durations and easings come from the tokens in tailwind.config.js.
 */
export const MOTION = {
  colors: 'transition-colors duration-fast ease-standard',
  surface: 'transition-[background-color,border-color,box-shadow] duration-base ease-standard',
  fade: 'transition-opacity duration-base ease-standard',
  lift: 'transition-[transform,box-shadow] duration-fast ease-standard',
  enter: 'animate-rise-in',
  enterFade: 'animate-fade-in',
} as const
