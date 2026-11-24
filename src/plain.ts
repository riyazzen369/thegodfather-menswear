/* CSS custom properties for a plain back in a given fabric tone (lighter centre, darker edge), or none for the shared default tone. */
const hex = (c: string) => /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null
const mix = (rgb: number[], t: number, to: number) => '#' + rgb.map(v => Math.round(v + (to - v) * t).toString(16).padStart(2, '0')).join('')
export function plainVars(tone?: string): React.CSSProperties {
  const rgb = tone ? hex(tone) : null
  if (!rgb) return {}
  return { '--plain-hi': mix(rgb, .14, 255), '--plain': tone, '--plain-lo': mix(rgb, .3, 0) } as React.CSSProperties
}
