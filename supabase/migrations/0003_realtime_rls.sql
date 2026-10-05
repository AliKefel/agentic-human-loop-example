do $$ declare t text; begin
  foreach t in array array['users','pitches','harness_configs','runs','checkpoints','agent_calls','tool_calls','approvals','founder_messages','memories','incidents','audit_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['runs','checkpoints','agent_calls','approvals','incidents','audit_log'] loop
    execute format('create policy %I on %I for select to anon using (true)', t || '_anon_read', t);
    execute format('alter publication supabase_realtime add table %I', t);
  end loop;
end $$;
