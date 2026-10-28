-- A stop can have a name as well as a number. REBA SL Season 2 stops are
-- held in different cities ("Stop 2 · Bristol"); Season 1 stops only have
-- numbers and keep showing "Stop N".
alter table public.competitions add column if not exists stop_name text;

comment on column public.competitions.stop_name is
  'Optional name for a stop (e.g. a city), shown beside the stop number.';
