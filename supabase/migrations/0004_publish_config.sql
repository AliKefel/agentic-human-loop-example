-- M10: publish a harness config atomically (SPEC §5.6). Never edits in place:
-- deactivates the current active config and inserts version max+1 as the new active one,
-- in a single transaction (the function body). Returns the new row as jsonb.
create or replace function publish_config(p jsonb, p_user uuid) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v int;
  r harness_configs;
begin
  -- Serialize concurrent publishes so max+1 and the single-active invariant hold.
  lock table harness_configs in share row exclusive mode;
  select coalesce(max(version), 0) + 1 into v from harness_configs;
  update harness_configs set is_active = false where is_active;
  insert into harness_configs (version, autonomy_level, thresholds, budgets, reliability, permissions, notes, is_active, created_by)
  values (v, (p->>'autonomy_level')::int, p->'thresholds', p->'budgets', p->'reliability', p->'permissions', p->>'notes', true, p_user)
  returning * into r;
  return to_jsonb(r);
end $$;

-- Server-only (service role); the browser's publishable key must not publish configs.
revoke execute on function publish_config(jsonb, uuid) from public, anon, authenticated;
grant execute on function publish_config(jsonb, uuid) to service_role;
