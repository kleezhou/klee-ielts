# Read-only daily check-in status

This separate Site lets the user's Grok Bot read only today's check-in boolean without signing into the private vocabulary app. Its transport accepts anonymous requests, while each report is protected by a 256-bit capability URL. The original app remains owner-private.

`/s/<read-key>` renders a small status page; append `?format=json` for JSON. Unknown/missing initial records return `checkedIn: null`, never a fabricated missed day. Dates use Asia/Shanghai. Yesterday's check-in never counts for today. Responses disable caching, indexing and referrer disclosure.

`PUT /publish` requires a separate bearer write key. The private vocabulary Worker sends only today's date, check-in boolean, source revision and source modification time; no words, email, account ID, learning state or history are transferred. D1 stores a single latest row. Out-of-order source revisions cannot overwrite newer records. Keys are SHA-256 digests in the report Site's `READ_KEY_HASH` and `WRITE_KEY_HASH` secrets. The writer key and report URL live only in the original Site's runtime secrets. No key belongs in Git or browser bundles. To revoke access, change the report Site's read hash and its original Site's share URL.

Build: `bash scripts/build.sh`. Check: `node check.mjs`, then `node scripts/validate-artifact.mjs`. Sites provisions DB and applies `drizzle/` migrations. The authoring agent verifies anonymous reads and authenticated writes end to end before handing over the URL. Grok Bot itself and its reminder routine are configured by the user in Grok Bot.
