# Turning on names and leaderboards (Supabase)

Until you do this, the game works fully offline: names are saved on each player's own device and the
leaderboard screen says "Leaderboards coming soon". Nothing breaks. When you are ready, it takes about
ten minutes and it is free.

## 1. Make a Supabase account and a project

1. Go to **https://supabase.com** and click the green **Start your project** button.
2. Sign in (the "Continue with GitHub" button is easiest, since you already have GitHub).
3. You land on a page that says **Projects**. Click the green **New project** button.
4. Fill in the little form:
   - **Name**: `platypus`
   - **Database Password**: click **Generate a password**, then copy it somewhere safe (you will
     probably never need it, but keep it).
   - **Region**: pick the one closest to you.
   - Plan: **Free**.
5. Click **Create new project**. A spinning screen says it is setting up. Wait until it finishes
   (one or two minutes).

## 2. Paste the database script

1. On the left side there is a column of small icons. Hover over them until you find
   **SQL Editor** (it looks like a little window with `>_` in it). Click it.
2. Click **+ New query** (top left of the editor) if an empty page is not already open.
3. On your computer, open the file `platypus/supabase/schema.sql` in Notepad (or VS Code).
   Press **Ctrl + A** (select everything), then **Ctrl + C** (copy).
4. Click inside the big empty editor on the Supabase page and press **Ctrl + V** (paste).
5. Click the green **Run** button at the bottom right (or press Ctrl + Enter).
6. At the bottom it should say **Success. No rows returned**. That is good: it means it worked.
   (If it asks "this query has destructive operations, run anyway?", click **Run this query**. The script is
   safe to run more than once; it never deletes players or scores.)

## 3. Copy two values into the game

1. On the left, click the **gear icon** (**Project Settings**), then **API** (in some versions it is
   called **Data API**, and the key is under **API Keys**).
2. You will see:
   - **Project URL**: something like `https://abcdefghijkl.supabase.co`. Click the copy button next to it.
   - **Project API keys** → the one labelled **anon** / **public**. Click its copy button.
     (Do NOT use the one called **service_role** or **secret**. That one must never go in the game.)
3. Open `platypus/src/online-config.js` and paste them between the quotes:

   ```js
   export const SUPABASE_URL = "https://abcdefghijkl.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...the long anon key...";
   ```

4. Save the file, then commit and push like you always do. Within a minute or two platyfy.com has
   names and leaderboards.

The anon key is meant to be public. It can only read the top-100 lists and call the game's checked
functions, which refuse rude names, taken names, impossible times and impossible coin totals.

## Good to know

- **Each device is one player.** A player's identity is a secret code saved in their browser. If they
  clear their browser's site data (or use a different browser or computer), they become a new player
  and have to pick a new name, because their old name stays reserved forever.
- **Names are unique forever.** Once anyone has used a name, nobody else can ever take it, not even
  after the first person renames. Capital letters do not matter (`Pip` and `pip` are the same name).
- **Fair play.** Every level has a minimum believable time (`level_rules`) and Level 4 has a maximum
  number of coins per show (`coin_rules`). You can change them in the **Table Editor** (left side, the
  icon that looks like a grid): click the table, double-click a number, type, and press Enter.

## How to remove a rude name by hand

If a rude name ever slips through:

1. Open the **SQL Editor** again and click **+ New query**.
2. Paste this, putting the name (in small letters) between the quotes:

   ```sql
   update players set name = null where lower(name) = 'the name here';
   ```

3. Click **Run**. The name disappears from every leaderboard at once. It stays in `names_ever`, so it
   can never be taken again by anyone. The player will be asked to pick a new name the next time they
   finish a level.

To ban a new word for everyone, add it to the list in `src/names.js` (the lists there are written in
ROT13; use any ROT13 website to encode it), run `node tools/gen-wordlists.cjs`, and run the new
`schema.sql` in the SQL Editor again. Or, quicker, for the server only:

```sql
insert into banned_words (word) values ('theword') on conflict do nothing;
```

## How to remove a cheated score

```sql
delete from times where player_id = (select id from players where lower(name) = 'the name here') and level = 7;
delete from coins where player_id = (select id from players where lower(name) = 'the name here');
```
