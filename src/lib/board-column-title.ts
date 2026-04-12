/** Default English titles from DB / seed — map to `items.columns.*` keys */
export const COLUMN_DB_TITLE_TO_I18N_KEY: Record<string, string> = {
  Status: 'status',
  Owner: 'owner',
  'Due date': 'dueDate',
  Priority: 'priority',
  Number: 'number',
  Text: 'text',
  Checkbox: 'checkbox',
  Tags: 'tags',
  Link: 'link',
  Files: 'file',
}

export function resolveColumnTitle(
  dbTitle: string,
  tColumns: (key: string) => string
): string {
  const k = COLUMN_DB_TITLE_TO_I18N_KEY[dbTitle]
  return k ? tColumns(k) : dbTitle
}
