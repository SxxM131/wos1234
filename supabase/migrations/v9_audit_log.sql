create table if not exists audit_log (
  id bigint generated always as identity primary key,
  action text not null check (action in ('delete_preference', 'cancel_reservation')),
  player_id integer,
  day_of_week text,
  cycle_id integer,
  snapshot jsonb,
  actor_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_cycle on audit_log (cycle_id);
create index if not exists idx_audit_log_created on audit_log (created_at desc);

alter table audit_log enable row level security;

-- service role만 접근 (anon 접근 불가, admin API는 service role 사용)
create policy "service role full access" on audit_log
  for all using (auth.role() = 'service_role');
