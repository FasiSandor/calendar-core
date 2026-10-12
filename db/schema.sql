create schema if not exists calendar_core;

create table if not exists calendar_core.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  event_date date,
  all_day boolean not null default false,
  timezone text not null default 'Europe/Budapest',
  category text not null default 'work',
  location text not null default '',
  note text not null default '',
  source_app text,
  source_record_id text,
  google_event_id text,
  dedupe_key text not null,
  status text not null default 'active' check (status in ('active','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint calendar_events_time_shape check (
    (all_day = true and event_date is not null and starts_at is null and ends_at is null)
    or
    (all_day = false and starts_at is not null and ends_at is not null and event_date is null)
  )
);

create unique index if not exists calendar_events_source_unique
  on calendar_core.calendar_events(source_app,source_record_id)
  where source_app is not null and source_record_id is not null and status='active';

create unique index if not exists calendar_events_google_unique
  on calendar_core.calendar_events(google_event_id)
  where google_event_id is not null and status='active';

create index if not exists calendar_events_dedupe_idx
  on calendar_core.calendar_events(dedupe_key)
  where status='active';

create index if not exists calendar_events_date_idx
  on calendar_core.calendar_events(event_date)
  where status='active';

create index if not exists calendar_events_starts_idx
  on calendar_core.calendar_events(starts_at)
  where status='active';

create table if not exists calendar_core.calendar_event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar_core.calendar_events(id) on delete cascade,
  source_app text not null,
  source_record_id text not null,
  source_url text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_app,source_record_id)
);

create table if not exists calendar_core.calendar_sync_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar_core.calendar_events(id) on delete cascade,
  provider text not null,
  external_id text not null,
  calendar_id text,
  last_synced_at timestamptz,
  sync_state text not null default 'linked',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_id),
  unique(event_id,provider)
);

