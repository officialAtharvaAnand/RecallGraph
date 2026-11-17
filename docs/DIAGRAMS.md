# RecallGraph diagrams

Use these files in the report and presentation.

| File | What it shows | Best time to show it |
| --- | --- | --- |
| `recallgraph-chen-er-diagram.svg` | Conceptual ER diagram in Chen notation: entities, relationships, attributes, keys, and cardinalities. | Use this when the evaluator asks for an ER diagram. |
| `recallgraph-schema-diagram.svg` | Physical PostgreSQL schema: types, generated search value, constraints, support tables, and graph outbox. | Explain implementation, integrity, and advanced SQL. |

SVG is vector artwork, so it remains sharp when inserted into Word, PowerPoint, or PDF. To open either new diagram on Windows:

```powershell
Start-Process .\docs\recallgraph-chen-er-diagram.svg
Start-Process .\docs\recallgraph-schema-diagram.svg
```
