-- Coach edits to a scouting report, and context on a single strength or weakness.
--
-- 1. scout_agent_reports.edits holds the coach's changes to the AI's wording
--    ({ basedOn: <generated_at of the plan they edited>, fields: { path: text } }).
--    The site only applies edits whose basedOn matches the plan on screen, so a
--    rebuild (new generated_at) leaves them dormant instead of pasting old
--    wording over a new plan. Their notes, which feed the AI, are kept.
--
-- 2. scout_coach_notes gains scope 'aspect': a note on one strength or weakness
--    of one player ("normally a 40% shooter" under Three-point shooting).
--    player_key is "<playerNameKey>#<aspectKey>" so it stays unique per area;
--    aspect_label is the area's name as the report shows it.

alter table public.scout_agent_reports add column if not exists edits jsonb;

alter table public.scout_coach_notes add column if not exists aspect_label text;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.scout_coach_notes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%scope%'
  loop
    execute format('alter table public.scout_coach_notes drop constraint %I', c);
  end loop;
end $$;

alter table public.scout_coach_notes
  add constraint scout_coach_notes_scope_check check (scope in ('team', 'player', 'aspect'));
alter table public.scout_coach_notes
  add constraint scout_coach_notes_key_check check (
    (scope = 'team' and player_key = '') or (scope in ('player', 'aspect') and player_key <> '')
  );
