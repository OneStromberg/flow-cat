# Default `Questions` tab seed

Paste these rows into the `Questions` tab (row 1 is the header). The admin can
reorder, retext, add, or remove rows afterwards.

| order | key   | type          | text                      | options | required |
|-------|-------|---------------|---------------------------|---------|----------|
| 1     | place | worker_places | Where did you work?       |         | yes      |
| 2     | date  | date          | Which day did you work?   |         | yes      |
| 3     | start | time          | What time did you start?  |         | yes      |
| 4     | end   | time          | What time did you finish? |         | yes      |

## Rules the admin must know
- `key` is the internal id and the WorkLogs column name — don't reuse a key.
- Keep **exactly one** `worker_places` question.
- For automatic `hours`, keep both a `start` and an `end` question of type `time`.
- `choice` questions need a comma-separated `options` cell.
- `required` defaults to yes; put `no` to let workers skip a question.

## Other tabs (headers)
- **Workers:** `phone | name | greeting | places | active`
- **Places:** `place_name | active`
- **WorkLogs:** `logged_at | phone | name | place | date | start | end | hours` (the bot extends this automatically)
