alter table audit_log drop constraint if exists audit_log_action_check;
alter table audit_log add constraint audit_log_action_check
  check (action in ('delete_preference', 'cancel_reservation', 'resubmit_preference'));

alter table audit_log add column if not exists source text;
-- 'secret_url' | 'google_form'
alter table audit_log add column if not exists was_locked boolean default false;
-- true면 last_assignment_run이 있는 상태에서 발생한 재신청
