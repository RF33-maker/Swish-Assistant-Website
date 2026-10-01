-- Scouting agent plumbing: shared secret, secret lookup, and the pg_cron sweep.
--
-- The scout-agent edge function authenticates callers with a shared secret
-- kept in Vault. pg_cron (via pg_net) and the site's server both send it in
-- an x-scout-secret header. The Anthropic key can live in Vault too
-- ('anthropic_api_key') if it isn't set as an edge function secret.

-- 1. Shared secret (random, generated once).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'scout_agent_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'scout_agent_cron_secret', 'Auth for the scout-agent edge function');
  end if;
end $$;

-- 2. Service-role-only lookup of the agent's secrets. Whitelisted names only.
create or replace function public.scout_agent_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name in ('scout_agent_cron_secret', 'anthropic_api_key')
  limit 1;
$$;

revoke all on function public.scout_agent_secret(text) from public, anon, authenticated;
grant execute on function public.scout_agent_secret(text) to service_role;

-- 3. Wake the agent every 10 minutes to pre-build reports for upcoming fixtures.
create extension if not exists pg_cron;

select cron.unschedule('scout-agent-sweep') where exists (select 1 from cron.job where jobname = 'scout-agent-sweep');
select cron.schedule(
  'scout-agent-sweep',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://omkwqpcgttrgvbhcxgqf.supabase.co/functions/v1/scout-agent',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-scout-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scout_agent_cron_secret')
    ),
    body := '{"action":"sweep","days":5,"limit":6}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
