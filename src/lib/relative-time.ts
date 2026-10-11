const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
]

/** „vor 5 Minuten“, „gestern“; years from 360 days on. */
export function relativeTime(value: string, now = Date.now()): string {
  let amount = Math.round((new Date(value).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(amount) < size) return rtf.format(amount, unit)
    amount = Math.round(amount / size)
  }
  return rtf.format(amount, 'year')
}
