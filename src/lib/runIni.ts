/** The archived run.ini's channel settings that decide how far jamming reaches. */
export interface RadioChannel {
  /** 3GPP scenario: UMa, UMi, RMa, InH… */
  scenario: string
  /** '3gpp' or 'nyu' */
  channelModel: string
  /** 'static_los' or 'auto' (probabilistic 3GPP LOS unless buildings are loaded) */
  conditionModel: string
  bandwidthHz: number
  noiseFigureDb: number
}

export type IniSections = Record<string, Record<string, string>>

/** Plain INI: [section], key = value, ';' or '#' comments. Keys and sections are lower-cased. */
export function parseIni(text: string): IniSections {
  const sections: IniSections = {}
  let current = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s[;#].*$/, '').trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const header = line.match(/^\[([^\]]+)\]$/)
    if (header) {
      current = header[1].trim().toLowerCase()
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    ;(sections[current] ??= {})[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim()
  }
  return sections
}

/** Defaults are the simulator's ConfigLoader defaults for an absent key. */
export function parseRadioChannel(text: string): RadioChannel {
  const channel = parseIni(text).channel ?? {}
  const num = (key: string, fallback: number) => {
    const value = Number(channel[key])
    return channel[key] !== undefined && Number.isFinite(value) ? value : fallback
  }
  return {
    scenario: channel.scenario ?? 'UMi',
    channelModel: (channel.channel_model ?? '3gpp').toLowerCase(),
    conditionModel: (channel.condition_model ?? 'auto').toLowerCase(),
    bandwidthHz: num('bandwidth_mhz', 400) * 1e6,
    noiseFigureDb: num('noise_figure_db', 5),
  }
}
