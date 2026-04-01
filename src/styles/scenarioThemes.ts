export interface ScenarioTheme {
  groundColor: string
  groundTexture: 'grass' | 'concrete' | 'tile' | 'dark'
  gridCellColor: string
  gridSectionColor: string
  ambientIntensity: number
  ambientColor: string
  directionalIntensity: number
  directionalColor: string
  pointIntensity: number
  /** drei Environment preset — null means no HDRI background */
  environmentPreset: 'forest' | 'city' | 'lobby' | 'sunset' | 'dawn' | 'park' | null
  environmentIntensity: number
  backgroundBlurriness: number
  sceneryType: 'rural' | 'urban-macro' | 'urban-micro' | 'indoor' | 'none'
  canvasBackground: string
}

const SCENARIO_THEMES: Record<string, ScenarioTheme> = {
  RMa: {
    groundColor: '#3a7d32',
    groundTexture: 'grass',
    gridCellColor: '#2d6127',
    gridSectionColor: '#1e4a1a',
    ambientIntensity: 0.6,
    ambientColor: '#fff5e6',
    directionalIntensity: 1.4,
    directionalColor: '#fff5e6',
    pointIntensity: 0.2,
    environmentPreset: 'forest',
    environmentIntensity: 0.4,
    backgroundBlurriness: 0.0,
    sceneryType: 'rural',
    canvasBackground: '#87CEEB',
  },
  UMa: {
    groundColor: '#4a4a4a',
    groundTexture: 'concrete',
    gridCellColor: '#666666',
    gridSectionColor: '#888888',
    ambientIntensity: 0.8,
    ambientColor: '#e8edf2',
    directionalIntensity: 1.0,
    directionalColor: '#e8edf2',
    pointIntensity: 0.3,
    environmentPreset: 'city',
    environmentIntensity: 0.3,
    backgroundBlurriness: 0.0,
    sceneryType: 'urban-macro',
    canvasBackground: '#c0c8d0',
  },
  UMi: {
    groundColor: '#555555',
    groundTexture: 'concrete',
    gridCellColor: '#707070',
    gridSectionColor: '#909090',
    ambientIntensity: 0.8,
    ambientColor: '#ffffff',
    directionalIntensity: 1.1,
    directionalColor: '#ffffff',
    pointIntensity: 0.3,
    environmentPreset: 'city',
    environmentIntensity: 0.3,
    backgroundBlurriness: 0.1,
    sceneryType: 'urban-micro',
    canvasBackground: '#b0b8c0',
  },
  InH: {
    groundColor: '#c8c0b8',
    groundTexture: 'tile',
    gridCellColor: '#a8a099',
    gridSectionColor: '#8a8279',
    ambientIntensity: 1.4,
    ambientColor: '#ffffff',
    directionalIntensity: 0.3,
    directionalColor: '#ffffff',
    pointIntensity: 0.6,
    environmentPreset: 'lobby',
    environmentIntensity: 0.3,
    backgroundBlurriness: 0.6,
    sceneryType: 'indoor',
    canvasBackground: '#f0f0f0',
  },
  default: {
    groundColor: '#040d1a',
    groundTexture: 'dark',
    gridCellColor: '#9ca3af',
    gridSectionColor: '#374151',
    ambientIntensity: 1.0,
    ambientColor: '#ffffff',
    directionalIntensity: 1.2,
    directionalColor: '#ffffff',
    pointIntensity: 0.4,
    environmentPreset: null,
    environmentIntensity: 0.5,
    backgroundBlurriness: 0,
    sceneryType: 'none',
    canvasBackground: '#ffffff',
  },
}

export function getScenarioTheme(scenario: string): ScenarioTheme {
  const s = scenario.toLowerCase()
  if (s.startsWith('rma')) return SCENARIO_THEMES.RMa
  if (s.startsWith('uma')) return SCENARIO_THEMES.UMa
  if (s.startsWith('umi')) return SCENARIO_THEMES.UMi
  if (s.startsWith('inh')) return SCENARIO_THEMES.InH
  return SCENARIO_THEMES.default
}
