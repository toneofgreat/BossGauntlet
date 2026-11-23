-- PLATYPUS online: names + leaderboards. Safe to run more than once.
-- Paste ALL of this into the Supabase SQL editor and press Run (see SETUP.md).
-- The word lists at the bottom are generated from src/names.js by `node tools/gen-wordlists.cjs`.
create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique,
  name        text,
  created_at  timestamptz not null default now(),
  renamed_at  timestamptz
);
create unique index if not exists players_name_lower_uq on public.players (lower(name)) where name is not null;

-- every name ever claimed, forever (a rename never frees the old one)
create table if not exists public.names_ever (
  lname       text primary key,                      -- lower(name)
  player_id   uuid not null references public.players(id) on delete cascade,
  claimed_at  timestamptz not null default now()
);

create table if not exists public.banned_words (word text primary key);
create table if not exists public.allowed_words (word text primary key);

create table if not exists public.runs (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  level       int  not null check (level between 1 and 13),
  hard        boolean not null default false,
  started_at  timestamptz not null default now(),
  used        boolean not null default false
);
create index if not exists runs_player_idx on public.runs (player_id, started_at desc);

create table if not exists public.times (
  player_id   uuid not null references public.players(id) on delete cascade,
  level       int  not null check (level between 1 and 13 and level <> 4),
  ms          int  not null check (ms > 0),
  at          timestamptz not null default now(),
  primary key (player_id, level)                    -- best time only
);
create index if not exists times_level_ms_idx on public.times (level, ms, at);

create table if not exists public.coins (
  player_id   uuid primary key references public.players(id) on delete cascade,
  coins       int  not null check (coins >= 0),
  hard        boolean not null default false,
  at          timestamptz not null default now()
);
create index if not exists coins_coins_idx on public.coins (coins desc, at);

-- per-level plausibility: fastest possible human time (ms) and a cap. Tuned at release (LEVELS3.md D2).
create table if not exists public.level_rules (
  level   int primary key,
  min_ms  int not null,
  max_ms  int not null default 10800000             -- 3 hours
);
insert into public.level_rules (level, min_ms) values
  (1, 45000), (2, 60000), (3, 60000), (5, 90000), (6, 120000), (7, 180000),
  (8, 150000), (9, 200000), (10, 240000), (11, 300000), (12, 360000), (13, 420000)
on conflict (level) do nothing;

-- level 4: the most coins one show can pay (measured by tools/playtest-online.cjs: a perfect HARD show pays about
-- 2650 with the finale; a normal show pays far less than 700) and the shortest real show.
create table if not exists public.coin_rules (hard boolean primary key, max_coins int not null, min_ms int not null);
insert into public.coin_rules values (false, 700, 150000), (true, 3300, 150000) on conflict do nothing;

-- ---------- RLS: the anon key can only READ the views; every write goes through the functions ----------
alter table public.players       enable row level security;
alter table public.names_ever    enable row level security;
alter table public.banned_words  enable row level security;
alter table public.allowed_words enable row level security;
alter table public.runs          enable row level security;
alter table public.times         enable row level security;
alter table public.coins         enable row level security;
alter table public.level_rules   enable row level security;
alter table public.coin_rules    enable row level security;
-- (no policies = no direct access for anon/authenticated)
revoke all on public.players, public.names_ever, public.banned_words, public.allowed_words,
  public.runs, public.times, public.coins, public.level_rules, public.coin_rules from anon, authenticated;

-- ---------- helpers ----------
-- the same fold as names.js fold(t, leet), character for character
create or replace function public.platy_fold(t text, leet boolean) returns text
language sql immutable as $$
  select regexp_replace(
           case when leet then
             replace(replace(replace(replace(
               translate(lower(t), '0123456789@$!|+€£¥', 'oizeasgtbgasiltely'),
               'ph','f'),'vv','w'),'ck','k'),'q','k')
           else lower(t) end,
         '[^a-z]', '', 'g')
$$;
-- strip diacritics without the unaccent extension (the server never trusts a client-folded copy)
create or replace function public.platy_deaccent(t text) returns text
language sql immutable as $$
  select translate(t, 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūýÿñçßÁÀÂÄÃÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÖÕØŌÚÙÛÜŪÝÑÇ',
                      'aaaaaaaeeeeeiiiiiooooooouuuuuyyncsaaaaaaaeeeeeiiiiiooooooouuuuuync')
$$;

-- is the banned word b, found at (1-based) position p of c, inside an allowed word at the same spot?
-- (names.js excused(); covering, not deleting, so an allowed word can never join two halves of a rude one)
create or replace function public.platy_excused(c text, p int, b text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_words a,
      lateral generate_series(1, greatest(char_length(a.word) - char_length(b) + 1, 0)) s
    where char_length(a.word) >= char_length(b)
      and substr(a.word, s, char_length(b)) = b
      and p - s + 1 >= 1
      and substr(c, p - s + 1, char_length(a.word)) = a.word)
$$;

create or replace function public.platy_rude_form(c text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare b text; p int; q int;
begin
  for b in select word from banned_words where position(word in c) > 0 loop
    p := 0;
    loop
      q := position(b in substr(c, p + 1));
      exit when q = 0;
      p := p + q;
      if not platy_excused(c, p, b) then return true; end if;
    end loop;
  end loop;
  return false;
end $$;

create or replace function public.platy_name_ok(n text) returns text   -- null = ok, else the reason
language plpgsql stable security definer set search_path = public as $$
declare v text; c text; forms text[];
begin
  if n is null then return 'invalid'; end if;
  n := regexp_replace(btrim(n), '\s+', ' ', 'g');
  if char_length(n) < 3 or char_length(n) > 16 then return 'invalid'; end if;
  if n !~ '^[A-Za-z0-9 _-]+$' then return 'invalid'; end if;
  if (select count(*) from regexp_matches(n, '[A-Za-z]', 'g')) < 2 then return 'invalid'; end if;
  v := platy_deaccent(n);
  forms := array[ platy_fold(v, false), platy_fold(v, true) ];
  forms := forms || array[ regexp_replace(forms[1], '(.)\1+', '\1', 'g'), regexp_replace(forms[2], '(.)\1+', '\1', 'g'),
                           regexp_replace(forms[1], '(.)\1\1+', '\1\1', 'g'), regexp_replace(forms[2], '(.)\1\1+', '\1\1', 'g') ];
  foreach c in array forms loop
    if platy_rude_form(c) then return 'rude'; end if;
  end loop;
  return null;
end $$;

create or replace function public.platy_player(p_token text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where token_hash = digest(p_token, 'sha256')
$$;

-- ---------- RPCs (the only way in) ----------
-- rename_player: a new never-used name; the old one stays in names_ever forever. Max one rename per 30 s.
create or replace function public.rename_player(p_token text, p_name text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; why text; nm text; last timestamptz;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  nm := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  why := platy_name_ok(nm);
  if why is not null then return json_build_object('ok', false, 'reason', why); end if;
  if exists (select 1 from names_ever where lname = lower(nm) and player_id = pid) then
    -- one of this player's own names: only the capitals changed, or going back to an old name of theirs
    update players set name = nm where id = pid;
    return json_build_object('ok', true, 'id', pid, 'name', nm);
  end if;
  select renamed_at into last from players where id = pid;
  if last is not null and last > now() - interval '30 seconds' then return json_build_object('ok', false, 'reason', 'slow'); end if;
  begin
    insert into names_ever (lname, player_id) values (lower(nm), pid);
  exception when unique_violation then
    return json_build_object('ok', false, 'reason', 'taken');
  end;
  update players set name = nm, renamed_at = now() where id = pid;
  return json_build_object('ok', true, 'id', pid, 'name', nm);
end $$;

-- claim_name: creates the player on first call (token never seen before) and claims a never-used name.
create or replace function public.claim_name(p_token text, p_name text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; why text; nm text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  nm := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  why := platy_name_ok(nm);
  if why is not null then return json_build_object('ok', false, 'reason', why); end if;
  pid := platy_player(p_token);
  if pid is null then
    insert into players (token_hash) values (digest(p_token, 'sha256')) returning id into pid;
  elsif (select name from players where id = pid) is not null then
    return rename_player(p_token, nm);
  end if;
  if exists (select 1 from names_ever where lname = lower(nm) and player_id = pid) then
    update players set name = nm where id = pid;
    return json_build_object('ok', true, 'id', pid, 'name', nm);
  end if;
  begin
    insert into names_ever (lname, player_id) values (lower(nm), pid);
  exception when unique_violation then
    return json_build_object('ok', false, 'reason', 'taken', 'id', pid);
  end;
  update players set name = nm where id = pid;
  return json_build_object('ok', true, 'id', pid, 'name', nm);
end $$;

-- start_run: a server timestamp the time must fit inside. Max 30 runs a minute per player.
-- (A player who has not picked a name yet is created here too, so the first run can count once they do.)
create or replace function public.start_run(p_token text, p_level int, p_hard boolean default false) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; rid uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_level is null or p_level not between 1 and 13 then
    return json_build_object('ok', false, 'reason', 'invalid'); end if;
  pid := platy_player(p_token);
  if pid is null then
    insert into players (token_hash) values (digest(p_token, 'sha256')) on conflict (token_hash) do nothing;
    pid := platy_player(p_token);
  end if;
  if (select count(*) from runs where player_id = pid and started_at > now() - interval '1 minute') >= 30 then
    return json_build_object('ok', false, 'reason', 'slow'); end if;
  delete from runs where player_id = pid and started_at < now() - interval '1 day';
  insert into runs (player_id, level, hard) values (pid, p_level, p_level = 4 and coalesce(p_hard, false)) returning id into rid;
  return json_build_object('ok', true, 'run', rid);
end $$;

-- submit_time: plausible (>= min_ms, <= max_ms) AND not faster than the real time since start_run (+2 s slack).
create or replace function public.submit_time(p_token text, p_run uuid, p_ms int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; r runs; rule level_rules; best int; rk int;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  if (select name from players where id = pid) is null then return json_build_object('ok', false, 'reason', 'noname'); end if;
  select * into r from runs where id = p_run and player_id = pid for update;
  if not found or r.used or r.level = 4 then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into rule from level_rules where level = r.level;
  if not found or p_ms is null or p_ms < rule.min_ms or p_ms > rule.max_ms then return json_build_object('ok', false, 'reason', 'implausible'); end if;
  if p_ms > extract(epoch from (now() - r.started_at)) * 1000 + 2000 then return json_build_object('ok', false, 'reason', 'implausible'); end if;
  update runs set used = true where id = r.id;
  insert into times (player_id, level, ms) values (pid, r.level, p_ms)
    on conflict (player_id, level) do update set ms = excluded.ms, at = now() where times.ms > excluded.ms;
  select ms into best from times where player_id = pid and level = r.level;
  select count(*) + 1 into rk from times where level = r.level and (ms < best);
  return json_build_object('ok', true, 'best', best, 'rank', rk);
end $$;

-- submit_coins: level 4 only; capped per mode; the show must have lasted min_ms since start_run.
create or replace function public.submit_coins(p_token text, p_run uuid, p_coins int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; r runs; rule coin_rules; cur coins; rk int;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  if (select name from players where id = pid) is null then return json_build_object('ok', false, 'reason', 'noname'); end if;
  select * into r from runs where id = p_run and player_id = pid for update;
  if not found or r.used or r.level <> 4 then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into rule from coin_rules where hard = r.hard;
  if p_coins is null or p_coins < 0 or p_coins > rule.max_coins
     or now() - r.started_at < make_interval(secs => rule.min_ms / 1000.0) then
    return json_build_object('ok', false, 'reason', 'implausible'); end if;
  update runs set used = true where id = r.id;
  insert into coins (player_id, coins, hard) values (pid, p_coins, r.hard)
    on conflict (player_id) do update set coins = excluded.coins, hard = excluded.hard, at = now() where coins.coins < excluded.coins;
  select * into cur from coins where player_id = pid;
  select count(*) + 1 into rk from coins where coins > cur.coins;
  return json_build_object('ok', true, 'best', cur.coins, 'rank', rk);
end $$;

-- my_rank: the pinned "you" row for a board (level 4 = coins)
create or replace function public.my_rank(p_token text, p_level int) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid uuid; v int; rk int; h boolean;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false); end if;
  if p_level = 4 then
    select coins, hard into v, h from coins where player_id = pid;
    if v is null then return json_build_object('ok', true); end if;
    select count(*) + 1 into rk from coins where coins > v;
    return json_build_object('ok', true, 'rank', rk, 'coins', v, 'hard', h);
  end if;
  select ms into v from times where player_id = pid and level = p_level;
  if v is null then return json_build_object('ok', true); end if;
  select count(*) + 1 into rk from times where level = p_level and ms < v;
  return json_build_object('ok', true, 'rank', rk, 'ms', v);
end $$;

-- ---------- top-100 views (read by anon; names only, never ids or hashes) ----------
create or replace view public.top_times with (security_invoker = false) as
  select level, rank, name, ms from (
    select t.level, rank() over (partition by t.level order by t.ms, t.at) as rank, p.name, t.ms
    from times t join players p on p.id = t.player_id where p.name is not null
  ) s where rank <= 100;

create or replace view public.top_coins with (security_invoker = false) as
  select rank, name, coins, hard from (
    select rank() over (order by c.coins desc, c.at) as rank, p.name, c.coins, c.hard
    from coins c join players p on p.id = c.player_id where p.name is not null
  ) s where rank <= 100;

grant select on public.top_times, public.top_coins to anon, authenticated;
revoke all on function public.platy_name_ok(text), public.platy_player(text), public.platy_excused(text, int, text),
  public.platy_rude_form(text) from anon, authenticated, public;
grant execute on function public.claim_name(text, text), public.rename_player(text, text),
  public.start_run(text, int, boolean), public.submit_time(text, uuid, int),
  public.submit_coins(text, uuid, int), public.my_rank(text, int) to anon, authenticated;

-- ---------- word lists (generated from src/names.js: node tools/gen-wordlists.cjs; do not edit by hand) ----------
-- BEGIN WORDS
-- 450 banned stems -> 489 folded entries; 144 allowed words -> 225 folded entries
insert into public.allowed_words (word) values
  ('class'), ('clas'), ('classy'), ('clasy'), ('classic'), ('clasic'), ('grass'), ('gras'), ('glass'), ('glas'),
  ('brass'), ('bras'), ('pass'), ('pas'), ('passion'), ('pasion'), ('passing'), ('pasing'), ('compass'), ('compas'),
  ('bass'), ('bas'), ('bassoon'), ('bason'), ('lass'), ('las'), ('lassie'), ('lasie'), ('mass'), ('mas'),
  ('massive'), ('masive'), ('sass'), ('sas'), ('sassy'), ('sasy'), ('cass'), ('cas'), ('cassie'), ('casie'),
  ('cassidy'), ('casidy'), ('assist'), ('asist'), ('assume'), ('asume'), ('assemble'), ('asemble'), ('asset'),
  ('aset'), ('assassin'), ('asasin'), ('embassy'), ('embasy'), ('jassid'), ('jasid'), ('hassle'), ('hasle'),
  ('tassel'), ('tasel'), ('vassal'), ('vasal'), ('cocktail'), ('coktail'), ('cockatoo'), ('cokatoo'), ('cockato'),
  ('cokato'), ('cockpit'), ('cokpit'), ('cockroach'), ('cokroach'), ('cockle'), ('cokle'), ('peacock'), ('peacok'),
  ('hancock'), ('hancok'), ('hitchcock'), ('hitchcok'), ('shuttlecock'), ('shuttlecok'), ('shutlecock'),
  ('shutlecok'), ('woodcock'), ('woodcok'), ('wodcock'), ('wodcok'), ('gamecock'), ('gamecok'), ('babcock'),
  ('babcok'), ('dickens'), ('dikens'), ('dickinson'), ('dikinson'), ('dickey'), ('dikey'), ('dickson'), ('dikson'),
  ('benedick'), ('benedik'), ('scunthorpe'), ('cunting'), ('shitake'), ('shiitake'), ('sussex'), ('susex'),
  ('essex'), ('esex'), ('middlesex'), ('midlesex'), ('sextant'), ('sextet'), ('sexton'), ('analog'), ('analyst'),
  ('analysis'), ('analytic'), ('canal'), ('banal'), ('grape'), ('drape'), ('trapeze'), ('scrape'), ('rapeseed'),
  ('rapesed'), ('scrap'), ('scrappy'), ('scrapy'), ('raccoon'), ('racon'), ('cocoon'), ('cocon'), ('tycoon'),
  ('tycon'), ('japan'), ('spice'), ('spicy'), ('conspicuous'), ('spicer'), ('homer'), ('homemade'), ('homogen'),
  ('cucumber'), ('document'), ('circum'), ('cumulus'), ('accumul'), ('acumul'), ('cumbersome'), ('computa'),
  ('reputa'), ('deputa'), ('amputa'), ('imputa'), ('disputa'), ('skyscraper'), ('sky'), ('skyler'), ('titan'),
  ('titanic'), ('stitch'), ('petit'), ('hello'), ('helo'), ('shell'), ('shel'), ('therapist'), ('butter'), ('buter'),
  ('button'), ('buton'), ('model'), ('modern'), ('hassan'), ('hasan'), ('hass'), ('has'), ('kass'), ('kas'),
  ('tass'), ('tas'), ('rass'), ('ras'), ('nass'), ('nas'), ('assam'), ('asam'), ('passive'), ('pasive'),
  ('massachusetts'), ('masachusets'), ('picasso'), ('picaso'), ('parapet'), ('kanal'), ('nazir'), ('cooney'),
  ('coney'), ('vacuum'), ('vacum'), ('cumin'), ('cumming'), ('cuming'), ('talcum'), ('georg'), ('janus'), ('uranus'),
  ('manus'), ('anush'), ('pakistan'), ('badminton'), ('swank'), ('fukuoka'), ('fukushima'), ('coke'), ('cokie'),
  ('dikemb'), ('benedikt'), ('nigeria'), ('dickie'), ('dikie'), ('cumber'), ('analise')
on conflict do nothing;
insert into public.banned_words (word) values
  ('fuck'), ('fuk'), ('fck'), ('fcuk'), ('phuck'), ('fukk'), ('fucker'), ('fuker'), ('fucking'), ('fuking'),
  ('fuckin'), ('fukin'), ('fuckface'), ('fukface'), ('fuckhead'), ('fukhead'), ('fuckwit'), ('fukwit'),
  ('motherfuck'), ('motherfuk'), ('mofo'), ('stfu'), ('gtfo'), ('wtf'), ('fubar'), ('shit'), ('shite'), ('shitty'),
  ('bullshit'), ('shithead'), ('shitface'), ('dipshit'), ('horseshit'), ('batshit'), ('ass'), ('asshole'),
  ('arsehole'), ('arse'), ('asswipe'), ('asshat'), ('assclown'), ('jackass'), ('jakass'), ('dumbass'), ('fatass'),
  ('badass'), ('smartass'), ('kissmyass'), ('bitch'), ('biatch'), ('bitchy'), ('sonofabitch'), ('btch'), ('bastard'),
  ('bastad'), ('cunt'), ('kunt'), ('cuntface'), ('twat'), ('dick'), ('dik'), ('dickhead'), ('dikhead'), ('dickface'),
  ('dikface'), ('dickwad'), ('dikwad'), ('cock'), ('cok'), ('cocksuck'), ('coksuk'), ('cockhead'), ('cokhead'),
  ('pussy'), ('pussies'), ('penis'), ('peen'), ('vagina'), ('vulva'), ('clit'), ('clitoris'), ('labia'), ('boob'),
  ('boobs'), ('boobies'), ('titty'), ('titties'), ('tits'), ('tittie'), ('porn'), ('porno'), ('pornhub'), ('xxx'),
  ('xvideos'), ('onlyfans'), ('brazzers'), ('sex'), ('sexy'), ('sexx'), ('sexual'), ('sexting'), ('nude'), ('nudes'),
  ('naked'), ('cum'), ('cumshot'), ('jizz'), ('jism'), ('semen'), ('sperm'), ('spunk'), ('dildo'), ('vibrator'),
  ('buttplug'), ('blowjob'), ('handjob'), ('rimjob'), ('footjob'), ('orgasm'), ('orgy'), ('horny'), ('boner'),
  ('erection'), ('anal'), ('anus'), ('butthole'), ('buttsex'), ('rape'), ('rapist'), ('raping'), ('molest'),
  ('pedo'), ('pedophile'), ('pedofile'), ('paedo'), ('pedobear'), ('groomer'), ('incest'), ('bestiality'),
  ('zoophile'), ('zoofile'), ('necro'), ('milf'), ('dilf'), ('hentai'), ('rule'), ('ruleea'), ('nsfw'), ('slut'),
  ('slutty'), ('whore'), ('skank'), ('thot'), ('hooker'), ('prostitute'), ('wank'), ('wanker'), ('tosser'),
  ('jerkoff'), ('jackoff'), ('jakoff'), ('masturbat'), ('fap'), ('fapping'), ('bollock'), ('bollok'), ('bollocks'),
  ('bolloks'), ('bugger'), ('piss'), ('pissed'), ('pissoff'), ('crap'), ('crappy'), ('douche'), ('douchebag'),
  ('nigger'), ('nigga'), ('nigg'), ('nigr'), ('niga'), ('negro'), ('negroid'), ('nignog'), ('chink'), ('gook'),
  ('gooks'), ('spic'), ('wetback'), ('wetbak'), ('beaner'), ('kike'), ('kyke'), ('yid'), ('raghead'), ('towelhead'),
  ('sandnigger'), ('cameljockey'), ('cameljokey'), ('coon'), ('jigaboo'), ('porchmonkey'), ('junglebunny'),
  ('golliwog'), ('darkie'), ('paki'), ('pakis'), ('gyppo'), ('gypo'), ('wop'), ('dago'), ('honky'), ('honkey'),
  ('chingchong'), ('fag'), ('fagg'), ('faggot'), ('fagot'), ('faggit'), ('dyke'), ('tranny'), ('shemale'),
  ('ladyboy'), ('homo'), ('homos'), ('queer'), ('kueer'), ('lesbo'), ('poofter'), ('retard'), ('retarded'), ('spaz'),
  ('spastic'), ('mongoloid'), ('cripple'), ('nazi'), ('nazis'), ('neonazi'), ('hitler'), ('heilhitler'),
  ('siegheil'), ('swastika'), ('fuhrer'), ('kkk'), ('whitepower'), ('whitepride'), ('gaschamber'), ('holocaust'),
  ('auschwitz'), ('ssbb'), ('iabb'), ('fourteen'), ('fourteenbb'), ('gasthejews'), ('killjews'), ('kys'),
  ('killyourself'), ('killurself'), ('kms'), ('suicide'), ('suicidal'), ('selfharm'), ('cutmyself'), ('cutyourself'),
  ('hangyourself'), ('neckyourself'), ('nekyourself'), ('terrorist'), ('alqaeda'), ('alkaeda'), ('taliban'),
  ('admin'), ('administrator'), ('moderator'), ('roblox'), ('platyfy'), ('official'), ('puta'), ('puto'), ('putas'),
  ('putos'), ('hijoputa'), ('hijodeputa'), ('mierda'), ('cabron'), ('cabrona'), ('pendejo'), ('pendeja'), ('verga'),
  ('chinga'), ('chingada'), ('chingar'), ('chingue'), ('culero'), ('joder'), ('jodete'), ('gilipollas'), ('marica'),
  ('maricon'), ('zorra'), ('follar'), ('cojones'), ('coger'), ('malparido'), ('malparida'), ('pinche'), ('carajo'),
  ('caralho'), ('buceta'), ('viado'), ('merda'), ('foder'), ('fodase'), ('fodido'), ('punheta'), ('cuzao'),
  ('arrombado'), ('xoxota'), ('merde'), ('putain'), ('salope'), ('connard'), ('connasse'), ('encule'), ('enculer'),
  ('batard'), ('niquer'), ('nikuer'), ('niquetamere'), ('nikuetamere'), ('petasse'), ('branleur'), ('enfoire'),
  ('couille'), ('couilles'), ('tagueule'), ('scheisse'), ('scheiss'), ('fotze'), ('hurensohn'), ('arschloch'),
  ('arsch'), ('wichser'), ('schlampe'), ('ficken'), ('fiken'), ('schwuchtel'), ('miststueck'), ('miststuek'),
  ('neger'), ('kanake'), ('spast'), ('missgeburt'), ('drecksau'), ('dreksau'), ('cazzo'), ('vaffanculo'),
  ('fanculo'), ('stronzo'), ('puttana'), ('troia'), ('minchia'), ('coglione'), ('frocio'), ('bastardo'),
  ('porcodio'), ('porcamadonna'), ('kanker'), ('klootzak'), ('godverdomme'), ('neuk'), ('neuken'), ('kankerlijer'),
  ('mongool'), ('flikker'), ('tyfus'), ('kutwijf'), ('kurwa'), ('chuj'), ('chujowy'), ('pierdol'), ('pierdole'),
  ('pierdolic'), ('jebac'), ('jebany'), ('jebana'), ('pizda'), ('skurwysyn'), ('spierdalaj'), ('cwel'), ('dupek'),
  ('blyat'), ('blyad'), ('suka'), ('cyka'), ('pizdec'), ('pizdets'), ('khuy'), ('huilo'), ('yebat'), ('yobany'),
  ('pidor'), ('pidar'), ('pidaras'), ('mudak'), ('gandon'), ('zalupa'), ('govno'), ('shlyukha'), ('eblan'),
  ('orospu'), ('siktir'), ('yarrak'), ('pezevenk'), ('gavat'), ('sikis'), ('sikerim'), ('aminakoyim'), ('gotveren'),
  ('ibne'), ('kahpe'), ('anjing'), ('bangsat'), ('kontol'), ('memek'), ('ngentot'), ('bajingan'), ('jancok'),
  ('goblok'), ('tolol'), ('ngewe'), ('pepek'), ('titit'), ('perek'), ('putangina'), ('tangina'), ('gago'),
  ('tarantado'), ('ulol'), ('kupal'), ('kantot'), ('jakol'), ('burat'), ('pukinginamo'), ('pakyu'), ('punyeta'),
  ('chutiya'), ('chutiye'), ('madarchod'), ('maderchod'), ('bhenchod'), ('behenchod'), ('bhosdi'), ('bhosdike'),
  ('bhosadike'), ('gaand'), ('gandu'), ('lavda'), ('harami'), ('haramzada'), ('bhadwa'), ('jhaat'), ('chodu'),
  ('bsdk'), ('ashole'), ('fuckyou'), ('fukyou'), ('fuckoff'), ('fukoff'), ('suckmydick'), ('sukmydik'), ('suckit'),
  ('sukit'), ('cocksucker'), ('coksuker'), ('nazism'), ('kkkk'), ('niggr'), ('nibba'), ('nigguh'), ('bitchass'),
  ('shitass'), ('fuckboy'), ('fukboy'), ('fuckgirl'), ('fukgirl'), ('sexslave'), ('pornstar'), ('camgirl')
on conflict do nothing;
-- END WORDS
