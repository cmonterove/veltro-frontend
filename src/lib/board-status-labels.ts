/** English labels stored in DB / column settings — map to `items.status.*` keys */
export const STATUS_DB_LABEL_TO_KEY = {
  'Not started': 'notStarted',
  'In progress': 'inProgress',
  Done: 'done',
  Stuck: 'stuck',
  Waiting: 'waiting',
  Cancelled: 'cancelled',
} as const
