/** Dynamic keys from DB (English status labels) — `columns.statusLabels.*` */
export function translateColumnStatusLabel(
  t: { has: (key: string) => boolean; (key: string): string },
  rawLabel: string
): string {
  const key = `statusLabels.${rawLabel}`
  if (t.has(key)) return t(key)
  return rawLabel
}
