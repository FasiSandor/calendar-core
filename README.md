# Calendar Core

Központi naptárszolgáltatás a HAVI NAPTÁR, Figyelő, MOTA és további saját alkalmazások számára.

## Cél

Egy eseménynek egyetlen kanonikus rekordja legyen. A különböző appok ugyanarra az eseményre hivatkozzanak, a Google Calendar pedig szinkronizációs cél / híd legyen az Apple Naptár felé.

```
HAVI / Figyelő / MOTA
        ↓
    Calendar Core
        ↓
   Google Calendar
        ↓
 iPhone / iPad / Mac
```

## Adatmodell

- `calendar_events`: kanonikus események
- `calendar_event_sources`: melyik app / találat hozta létre vagy hivatkozza az eseményt
- `calendar_sync_links`: külső naptárkapcsolatok, például Google event ID

A `source_app + source_record_id` páros idempotens. Ugyanaz a Figyelő-találat másodszor nem hoz létre új eseményt.

## API

Minden esemény API kéréshez:
`x-calendar-core-key: <CALENDAR_CORE_API_KEY>`

- `GET /api/health`
- `GET /api/events?from=...&to=...`
- `POST /api/events`
- `GET /api/events/:id`
- `PATCH /api/events/:id`
- `DELETE /api/events/:id`

## Supabase

A `supabase/schema.sql` fájlt egyszer kell lefuttatni a központi Supabase projekt SQL Editorában.

Szükséges Vercel környezeti változók:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CALENDAR_CORE_API_KEY`

A service role kulcs kizárólag szerveroldalon használható.

## Következő lépés

1. Supabase projekt / séma létrehozása.
2. Calendar Core deploy Vercelre.
3. HAVI szerveroldali proxy bekötése.
4. Figyelő `Naptárba` műveletének bekötése.
5. Google kétirányú szinkron központi kezelése.
