# Read-along script payloads

Paid (and free) read-along text is stored in the Worker KV namespace `ENTITLEMENTS` under `script:<guideId>:<lang>`, not in the public website.

Payloads are built from the Earwise app catalog (`src/data/catalog/guides/*.json`, preferred) with a markdown fallback from `content/source/...`. Upload with `wrangler kv bulk put <file> --remote`. Do not commit the generated JSON.
