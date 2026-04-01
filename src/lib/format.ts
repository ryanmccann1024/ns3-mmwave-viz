export function freqLabel(hz: number): string {
  return hz >= 1e9 ? `${(hz / 1e9).toFixed(1)} GHz` : `${(hz / 1e6).toFixed(0)} MHz`
}
