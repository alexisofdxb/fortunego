# shared

Cross-domain code with no owner: `snapshot.ts` (the full player read-model assembler
that joins every domain for the `/api/plot` response), `offline.ts` (presence/offline
catch-up engine), `types.ts` (Hono context typings + wire-format helpers like `num`),
and `config.ts` (env loading/validation). Domains may import from here; shared must not
import from domain route files.
