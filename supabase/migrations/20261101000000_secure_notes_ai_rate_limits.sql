create table if not exists public.notes_ai_rate_limits (
  google_subject_hash text primary key check (google_subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 13)
);

create index if not exists notes_ai_rate_limits_window_idx
  on public.notes_ai_rate_limits (window_started_at);

alter table public.notes_ai_rate_limits enable row level security;
revoke all on table public.notes_ai_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.notes_ai_rate_limits to service_role;

create or replace function public.claim_notes_ai_request(p_google_subject_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_time timestamptz := clock_timestamp();
  current_count integer;
begin
  if p_google_subject_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into public.notes_ai_rate_limits (google_subject_hash, window_started_at, request_count)
  values (p_google_subject_hash, request_time, 1)
  on conflict (google_subject_hash) do update
    set window_started_at = case
          when public.notes_ai_rate_limits.window_started_at <= request_time - interval '1 minute' then request_time
          else public.notes_ai_rate_limits.window_started_at
        end,
        request_count = case
          when public.notes_ai_rate_limits.window_started_at <= request_time - interval '1 minute' then 1
          else least(public.notes_ai_rate_limits.request_count + 1, 13)
        end
  returning request_count into current_count;

  delete from public.notes_ai_rate_limits
    where window_started_at < request_time - interval '24 hours';

  return current_count <= 12;
end;
$$;

revoke all on function public.claim_notes_ai_request(text) from public, anon, authenticated;
grant execute on function public.claim_notes_ai_request(text) to service_role;