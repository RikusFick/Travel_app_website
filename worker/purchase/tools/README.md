# Read-along script payloads

Paid (and free) read-along text is stored in the Worker KV namespace `ENTITLEMENTS` under `script:<guideId>:<lang>`, not in the public website.

To rebuild and upload from the app repo (catalog JSON preferred, markdown fallback):

```
python3 tools/build-readalong-scripts.py \
  --catalog /path/to/travel_app/src/data/catalog/guides \
  --content /path/to/travel_app/content \
  --audio ../../data/audio.json \
  --out /tmp/earwise-scripts

# then, from worker/purchase:
# wrangler kv bulk put /tmp/earwise-scripts/bulk-00.json --remote
```

Do not commit the generated JSON.
