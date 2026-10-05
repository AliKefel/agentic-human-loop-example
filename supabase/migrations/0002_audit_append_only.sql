create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only (% blocked)', tg_op;
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_immutable();
