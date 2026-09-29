// src/games/showdown/scripts/shops.js - Showdown's four kiosks. Spec 25 §10 owns this
// file: 🎩 Hats, 😄 Emotes, 🗡️ Skins and 🏆 The Vault, each one a
// ctx.services.ui.openPanel plus (for the first three) a ctx.services.ui.shopGrid.
//
// WHAT THIS MODULE DOES NOT DO, because a shop that quietly owned the ledger would be the
// worst place in the Place to put it:
//   - it never calls economy.spend and it never calls economy.award. `handlers.onBuy`
//     spends, and game.js owns onBuy because game.js owns the save and the forced save()
//     that has to land in the same statement group as the ownership write (§14). This
//     module supplies the PRICE off the config row and reads back a verdict.
//   - it never writes to `save`. It reads it to paint rows, and it re-reads it after every
//     verdict. So a row is drawn owned only because game.js wrote it owned, which by the
//     contract it does only when economy.spend returned true (§10, and the MODULE CONTRACT
//     in config.js says it from the other side).
//   - it never awards a badge, never publishes, never touches the world, never teleports.
//
// ONE PANEL AT A TIME, AND IT IS OUR JOB TO CLOSE IT. A second openPanel silently closes
// the first (shell.js's openPanel starts with `if (panelHandle) panelHandle.close()`), and
// a panel left open at dispose is never closed by the platform - the shell's teardown
// clears HUD chips and hides the rig and leaves panels alone, so a kiosk open when the
// player walks back to the Hub would sit over the Hub forever. Hence: open() closes ours
// first, explicitly, rather than letting the platform do it in the middle of our own open;
// close() is idempotent and is called from game.js's dispose; and the panel's own onClose
// (the ✕, Escape, the scrim, or another surface opening) clears our state too, so
// isOpen() can never claim a panel that is not on screen.
//
// THE CONFIRM IS BUILT IN THE PANEL BODY, NOT WITH ctx.services.ui.dialog. The axe oath
// spends a hundred Fighting Points and must be confirmed (§10.4), but the platform dialog
// hands its caller a bare Promise and no way to take the modal back down, so a Place
// teardown mid-confirm strands a platform modal over the Hub and latches the shell's
// `dialogOpen` with it - the defect lifting/scripts/ui.js's openConfirm was written to
// escape. The oath's confirm therefore lives inside our own panel body, dies with the
// panel, and can never outlive the Place.
//
// House rules for this file (§17.1): no banned identifier anywhere including inside a
// string, so there is no timer of any kind here - every one of these surfaces is
// event-driven and repaints on a verdict, never on a clock. Lower-case hex only. Prices,
// reasons, thresholds and gates come from config.js and are never written out a second
// time. Text goes in through textContent, never innerHTML (spec 06 §3.5).

import {
  EMOTES,
  HATS,
  MAPS,
  OBBY_STAGES,
  SKINS,
  TIERS,
  TUNE,
  WEAPONS,
  WINGS_CATALOG_ID,
  BADGES,
  skinAvailable,
  unlocksFor,
} from "./config.js";

// The four kiosks, keyed by the `which` open() takes. `kind` is what rides
// handlers.onBuy / handlers.onEquip as their first argument, and it is deliberately the
// SINGULAR noun rather than the kiosk name: it is the key into save.equipped
// ({hat, emote, skin}) and the stem of the owned arrays (ownedHats/ownedEmotes/ownedSkins),
// so game.js can switch on it once and index both. The Vault sells nothing and therefore
// carries no kind at all.
const KIOSKS = Object.freeze({
  hats: Object.freeze({ kind: "hat", title: "🎩 Hats" }),
  emotes: Object.freeze({ kind: "emote", title: "😄 Emotes" }),
  skins: Object.freeze({ kind: "skin", title: "🗡️ Skins" }),
  vault: Object.freeze({ kind: null, title: "🏆 The Vault" }),
});

// UI accents, and only UI accents: they dress a progress bar and a heading, they change no
// gameplay number, and that is why they are here and not in TUNE. Lower-case hex, because
// the part schema's `^#[0-9a-f]{6}$` is the house habit even where no part is involved.
const GOLD = "#e0b23a";
const SKY = "#8bd0e6";
const DIM = "var(--oof-text-dim, #9aa3b8)";
const TEXT = "var(--oof-text, #f2f4fa)";
const CARD = "background:var(--oof-surface2, #1d2130);border-radius:12px;padding:12px;margin:0 0 10px;";

// One module-level state object, the house shape, and it is null whenever no panel of ours
// is on screen. Nothing mutable survives close(), so a second init after a dispose starts
// with no panel, no handlers and no reference to the old save blob.
let S = null;

// =====================================================================================
// open / close / isOpen - the whole exported surface (MODULE CONTRACT)
// =====================================================================================

// open(ctx, which, save, handlers) - shows one kiosk. `save` is game.js's live save object
// (the clone saves.load() handed it), held by reference so a repaint after a purchase sees
// the write game.js just made; this module only ever reads it.
export function open(ctx, which, save, handlers) {
  const kiosk = KIOSKS[which];
  if (!ctx || !kiosk) {
    // An unknown kiosk id is a programming error, not a player input. Saying so beats
    // opening an empty panel that looks like a broken shop.
    console.warn("[oof] showdown shops: unknown kiosk", which);
    return;
  }

  // Ours closes first, in our own order. Letting the platform close it during its own
  // openPanel would fire our onClose AFTER we had already begun building the new panel,
  // and a null'd S would then be holding a live handle.
  close(ctx);

  const handle = ctx.services.ui.openPanel({
    title: kiosk.title,
    onClose: () => { if (S && S.handle === handle) S = null; },
  });
  // ui.openPanel is wrapped in the shell's `safely`, which returns
  // { el: null, bodyEl: null, close(){} } if anything threw. A kiosk with nowhere to draw
  // is not a kiosk, so tidy up rather than painting into nothing.
  const body = handle && (handle.bodyEl || handle.el);
  if (!body) {
    if (handle && typeof handle.close === "function") { try { handle.close(); } catch { /* fine */ } }
    return;
  }

  S = {
    ctx,
    which,
    kiosk,
    handle,
    body,
    save: save || {},
    handlers: handlers || {},
    // The oath's confirm is armed per open() and disarmed by every repaint, so it can
    // never be armed by one painting and spent by the next.
    oathArmed: false,
    oathPending: false,
  };
  render();
}

// close(ctx) - idempotent, and called from game.js's dispose because the platform never
// closes a Place's panel for it (§10, §17.4). S is nulled BEFORE handle.close() so the
// onClose above is a no-op rather than a second teardown of state we already dropped.
export function close(ctx) {
  const handle = S ? S.handle : null;
  S = null;
  if (handle && typeof handle.close === "function") {
    try { handle.close(); } catch { /* a panel already gone is the outcome we wanted */ }
  }
  // `ctx` is in the signature because the MODULE CONTRACT fixes it there. Nothing in here
  // needs it: the handle closes itself, and reaching for services through a ctx that
  // dispose has already walked past is exactly the failure this file is built to avoid.
}

export function isOpen() {
  return S !== null;
}

// =====================================================================================
// Painting
// =====================================================================================

// Every surface is rebuilt from `save` on every repaint. A shop that patched individual
// rows in place would have to track which row held which id, and the rows themselves are
// the platform's (shopGrid builds them), so there is nothing to patch: the grid is cheap,
// and it is only ever rebuilt on a click.
//
// render() paints the state it finds, INCLUDING `oathArmed`, and never edits it. Every
// caller that must take the oath's confirm back down sets the flag false first, which is
// what stops an arm surviving the thing it was armed for.
function render() {
  if (!S) return;
  S.body.textContent = "";
  if (S.which === "vault") renderVault();
  else renderShop();
}

// Disarm, then paint. This is the repaint every outcome uses; only the oath button itself
// arms, and only by setting the flag true before calling render().
function repaint() {
  if (!S) return;
  S.oathArmed = false;
  render();
}

function renderShop() {
  const rows = rowsFor(S.which);

  S.body.appendChild(noteCard(shopNote(S.which)));
  S.body.appendChild(balanceRow());

  const items = rows.map((row) => ({
    id: row.id,
    name: row.locked ? row.name + " (locked)" : row.name,
    icon: row.icon,
    price: row.price,
    owned: row.owned,
    equipped: row.equipped,
  }));
  S.body.appendChild(S.ctx.services.ui.shopGrid({
    items,
    onSelect: (item) => onSelect(rows, item),
  }));

  // One line per row under the grid, because a shopGrid card carries an icon, a name and a
  // price and nothing else - and every row in this Place's catalogue has a `desc` written
  // to be read (§10.1-§10.3). A locked row says what unlocks it here rather than only when
  // you tap it.
  const list = el("div", "margin:12px 0 0;");
  for (const row of rows) {
    const line = el("div", "padding:8px 0;border-top:1px solid var(--oof-stroke, #2a2f40);");
    line.appendChild(el("div", `font:700 14px/18px system-ui;color:${TEXT};`, row.icon + " " + row.name));
    line.appendChild(el("div", `font:400 13px/18px system-ui;color:${DIM};`, row.desc));
    if (row.locked) {
      line.appendChild(el("div", `font:700 12px/18px system-ui;color:${GOLD};`, row.lockNote));
    }
    list.appendChild(line);
  }
  S.body.appendChild(list);
}

// The rows of one selling kiosk, with ownership resolved. This is the only place ownership
// is decided, so the grid, the BUY/EQUIP routing and the already-owned guard can never
// disagree with each other.
function rowsFor(which) {
  const save = S.save;
  if (which === "hats") {
    const owned = arr(save.ownedHats);
    return HATS.map((h) => ({
      id: h.id, name: h.name, icon: h.icon, price: h.price, desc: h.desc,
      // §10: ownership for the two Catalog hats is ownedHats.includes(id) OR
      // avatar.owns(catalogId). Both halves are load-bearing. Without the second, a player
      // who already owns hat_golden from anywhere else on the platform - or whose local
      // ownedHats was reset by §14's field-level fallback - is charged 1000 Oofbux for a
      // hat already on their head.
      owned: owned.indexOf(h.id) >= 0 || avatarOwns(h.catalogId),
      equipped: equippedId("hat") === h.id,
      locked: false, lockNote: "",
    }));
  }
  if (which === "emotes") {
    const owned = arr(save.ownedEmotes);
    return EMOTES.map((e) => ({
      id: e.id, name: e.name, icon: e.icon, price: e.price, desc: e.desc,
      owned: owned.indexOf(e.id) >= 0,
      equipped: equippedId("emote") === e.id,
      locked: false, lockNote: "",
    }));
  }
  const owned = arr(save.ownedSkins);
  const cleared = num(save.obbyStage);
  return SKINS.map((s) => {
    // skinAvailable reads save.obbyStage as the number of stages CLEARED (§14), so
    // glitchsteel's needsStage 6 means all six cleared in sequence. Read the other way -
    // "the highest stage reached" - merely entering the `error` stage would open the one
    // thing in this shop the obby is supposed to gate.
    const sellable = skinAvailable(s, cleared);
    const isOwned = owned.indexOf(s.id) >= 0;
    return {
      id: s.id, name: s.name, icon: s.icon, price: s.price, desc: s.desc,
      owned: isOwned,
      equipped: equippedId("skin") === s.id,
      // An owned row is never locked: a gate that could take a skin back off a player who
      // already paid for it would be a bug with a receipt.
      locked: !isOwned && !sellable,
      lockNote: "Sold once " + (s.needsStage || 0) + " of the " + OBBY_STAGES.length
        + " lobby obby stages are cleared, in sequence. Cleared so far: " + cleared + ".",
    };
  });
}

// A tap on a card. Three outcomes and no fourth: a locked row is refused here and never
// reaches onBuy, an owned row equips and never reaches onBuy, and everything else buys.
function onSelect(rows, item) {
  if (!S || !item) return;
  const row = rows.find((r) => r.id === item.id);
  if (!row) return;
  const kind = S.kiosk.kind;

  if (row.locked) {
    sfx("denied");
    toast({ variant: "error", icon: "🔒", title: row.name + " is not for sale yet", body: row.lockNote });
    return;
  }

  // AN OWNED ROW IS NEVER A BUY TARGET (§10). Without this a second tap on the Golden Hat
  // calls spend(1000, ...) again and succeeds.
  if (row.owned) {
    if (row.equipped) {
      // Already worn. Tapping it again is not a request for anything, so it costs nothing
      // and says nothing; the card already reads "Equipped".
      sfx("click");
      return;
    }
    if (typeof S.handlers.onEquip === "function") {
      try { S.handlers.onEquip(kind, row.id); } catch (err) { console.warn("[oof] showdown shops: onEquip failed", err); }
    }
    sfx("click");
    repaint();
    return;
  }

  const verdict = buy(kind, row);
  if (verdict === "bought") {
    sfx("purchase");
    // This toast names the PURCHASE, not the grant. The two Catalog hats are also handed
    // to avatar.grantItem, which raises its own "Unlocked: ..." toast and must not be
    // toasted on top of (§16.11) - but that toast does not exist when the Catalog row is
    // not live yet, and 1000 Oofbux leaving the balance in silence is worse than one extra
    // line.
    toast({ variant: "purchase", icon: row.icon, title: "Bought " + row.name, body: fmt(row.price) + " Oofbux" });
  } else if (verdict === "owned") {
    // game.js saw ownership this module did not - a Catalog grant from elsewhere, or a
    // save reloaded under us. Nothing was spent; repaint so the row becomes EQUIP.
    sfx("denied");
    toast({ icon: row.icon, title: "You already own " + row.name });
  } else {
    sfx("denied");
    const short = row.price - balance();
    toast({
      variant: "error", icon: row.icon, title: "Not enough Oofbux",
      body: short > 0 ? "You need " + fmt(short) + " more." : "That purchase was refused.",
    });
  }
  repaint();
}

// One call into game.js, one verdict out. A handler that throws is treated as a refusal:
// the alternative is a click that appears to have done something when nothing was spent.
function buy(kind, row) {
  if (typeof S.handlers.onBuy !== "function") return "denied";
  try {
    const verdict = S.handlers.onBuy(kind, row.id, row.price);
    return verdict === "bought" || verdict === "owned" ? verdict : "denied";
  } catch (err) {
    console.warn("[oof] showdown shops: onBuy failed", err);
    return "denied";
  }
}

// =====================================================================================
// The Vault (§10.4) - no purchases at all
// =====================================================================================
// It exists because an unlock is a spend, and a spend deserves a confirmation rather than
// a pad you walk over by accident. Everything on it is read off `save`, config and the
// platform services; nothing on it can take an Oofbux.
function renderVault() {
  const save = S.save;
  const unlocks = unlocksFor(save);
  const points = num(save.points);
  const wins = num(save.lifetimeWins);

  // --- the three headline numbers ---
  const head = el("div", CARD);
  head.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, "Your record"));
  head.appendChild(statLine("⚔️", "Fighting Points, spendable", String(points)));
  head.appendChild(statLine("🏆", "Lifetime wins", String(wins)));
  head.appendChild(statLine("🪙", "Oofbux", fmt(balance())));
  head.appendChild(statLine("🪜", "Lobby obby stages cleared", num(save.obbyStage) + " of " + OBBY_STAGES.length));
  S.body.appendChild(head);

  // --- unlock one: the axe oath, which SPENDS the hundred (§13.1) ---
  const oath = el("div", CARD);
  oath.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, "🪓 The Axe Oath"));
  oath.appendChild(el("div", `font:400 13px/18px system-ui;color:${DIM};margin:4px 0 8px;`,
    "Spend " + TUNE.LUCK_UNLOCK_POINTS + " Fighting Points and every round starts with the Woodsman's Axe in your hands, "
    + "with a " + TUNE.LUCK_UNLOCK_PERCENT + "% chance that a ground weapon's rarity is rolled twice and the rarer kept."));
  oath.appendChild(meter(points / TUNE.LUCK_UNLOCK_POINTS, GOLD));
  oath.appendChild(el("div", `font:700 12px/18px system-ui;color:${DIM};margin:6px 0 10px;`,
    Math.min(points, TUNE.LUCK_UNLOCK_POINTS) + " / " + TUNE.LUCK_UNLOCK_POINTS + " Fighting Points"));
  oath.appendChild(oathControl(points, unlocks));
  S.body.appendChild(oath);

  // --- unlock two: the wings, which spend nothing (§13.2) ---
  const wings = el("div", CARD);
  wings.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, "🕊️ Champion Wings"));
  wings.appendChild(el("div", `font:400 13px/18px system-ui;color:${DIM};margin:4px 0 8px;`,
    "Win " + TUNE.FLY_UNLOCK_WINS + " rounds: fly inside Showdown; wings everywhere."));
  wings.appendChild(meter(wins / TUNE.FLY_UNLOCK_WINS, SKY));
  wings.appendChild(el("div", `font:700 12px/18px system-ui;color:${DIM};margin:6px 0 10px;`,
    Math.min(wins, TUNE.FLY_UNLOCK_WINS) + " / " + TUNE.FLY_UNLOCK_WINS + " lifetime wins"));
  wings.appendChild(wingsControl(unlocks));
  S.body.appendChild(wings);

  // --- per-map wins ---
  const grounds = el("div", CARD);
  grounds.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, "Wins by ground"));
  const mapWins = save.mapWins && typeof save.mapWins === "object" ? save.mapWins : {};
  for (const map of MAPS) grounds.appendChild(statLine(map.icon, map.name, String(num(mapWins[map.id]))));
  S.body.appendChild(grounds);

  // --- the badge wall ---
  // The rows come from config.BADGES rather than badges.getDef, because getDef answers null
  // until the `showdown.*` rows land in the platform registry (§13.3) and a wall of nulls
  // would be a worse bug to read than a wall of unearned plaques. `has` takes the bare
  // suffix and the platform prefixes it with this slug.
  const wall = el("div", CARD);
  wall.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, "Badges"));
  for (const badge of BADGES) {
    const earned = badgeEarned(badge.id);
    // A secret badge nobody has earned shows a bare "?" and no description, the way the
    // Hub's own wall draws one: telling you how to earn it is what makes it not a secret.
    const hidden = !earned && badge.secret;
    const row = el("div", "display:flex;align-items:flex-start;gap:8px;padding:6px 0;");
    row.appendChild(el("div", `font:700 18px/20px system-ui;width:24px;text-align:center;color:${earned ? GOLD : DIM};`,
      hidden ? "?" : badge.icon));
    const textCol = el("div", "flex:1;");
    textCol.appendChild(el("div", `font:700 13px/18px system-ui;color:${earned ? TEXT : DIM};`,
      hidden ? "Secret badge" : badge.name));
    if (!hidden) {
      textCol.appendChild(el("div", `font:400 12px/16px system-ui;color:${DIM};`, badge.description));
    }
    row.appendChild(textCol);
    row.appendChild(el("div", `font:700 12px/18px system-ui;color:${earned ? GOLD : DIM};`, earned ? "Earned" : "Locked"));
    wall.appendChild(row);
  }
  S.body.appendChild(wall);

  // --- the weapon compendium, sorted by tier ---
  // §7.1's `desc` is written to be read on pickup AND here, and TIERS is the order the
  // Vault sorts by. Nothing on this list can be bought: weapons are found, not bought
  // (§2.5), and the only row you can own is the one the oath above hands you.
  const book = el("div", CARD);
  book.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, "Weapons"));
  book.appendChild(el("div", `font:400 12px/16px system-ui;color:${DIM};margin:2px 0 8px;`,
    "Every weapon in a round came off the ground you voted for. Nothing in this shop changes a number below."));
  book.appendChild(weaponGroup("Earned", WEAPONS.filter((w) => w.tier === "starter")));
  for (const map of MAPS) {
    book.appendChild(weaponGroup(map.icon + " " + map.name,
      WEAPONS.filter((w) => w.tier !== "starter" && w.maps.indexOf(map.id) >= 0)
        .slice()
        .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))));
  }
  S.body.appendChild(book);
}

// SWEAR THE AXE OATH, and its in-panel confirm. Three states, and the guard is re-derived
// at click time rather than trusted from the painting: a win can land between the paint and
// the tap, and game.js's onSpendPoints re-checks the same gate a third time.
function oathControl(points, unlocks) {
  if (unlocks.startingAxe) {
    return el("div", `font:700 13px/18px system-ui;color:${GOLD};`,
      "Sworn. The axe is in your hands at every round start, and the rarity roll carries the luck bias.");
  }
  if (points < TUNE.LUCK_UNLOCK_POINTS) {
    // Disabled rather than absent: the bar above it is the whole point of the Vault, and a
    // button that is not there yet says nothing about what you are climbing towards.
    return pushButton("SWEAR THE AXE OATH", true);
  }
  if (!S.oathArmed) {
    const btn = pushButton("SWEAR THE AXE OATH", false);
    btn.addEventListener("click", () => {
      if (!S) return;
      sfx("click");
      // The flag is set BEFORE the paint, because render() paints what it finds. This is
      // the one place in the file that arms it, and the confirm replaces the button on the
      // way through.
      S.oathArmed = true;
      render();
    });
    return btn;
  }

  // Armed. The confirm lives here, inside the panel body, so it dies with the panel and
  // can never sit over the Hub after a dispose.
  const wrap = el("div", "");
  wrap.appendChild(el("div", `font:700 13px/18px system-ui;color:${GOLD};margin:0 0 8px;`,
    "Spend " + TUNE.LUCK_UNLOCK_POINTS + " Fighting Points? Your lifetime wins are untouched; the points are gone."));
  const row = el("div", "display:flex;gap:8px;");
  const cancel = pushButton("Cancel", false, "var(--oof-surface, #171a24)");
  cancel.addEventListener("click", () => {
    if (!S) return;
    sfx("ui_close");
    repaint();
  });
  const swear = pushButton("SWEAR IT", false, GOLD, "#141414");
  swear.addEventListener("click", () => {
    if (!S || S.oathPending) return;
    // The gate again, off the live save: points >= 100 && !startingAxe (§13.1).
    const live = unlocksFor(S.save);
    if (live.startingAxe || num(S.save.points) < TUNE.LUCK_UNLOCK_POINTS) {
      sfx("denied");
      toast({ variant: "error", icon: "🪓", title: "The oath cannot be sworn right now" });
      repaint();
      return;
    }
    S.oathPending = true;
    let ok = false;
    if (typeof S.handlers.onSpendPoints === "function") {
      try { ok = S.handlers.onSpendPoints() === true; } catch (err) {
        console.warn("[oof] showdown shops: onSpendPoints failed", err);
      }
    }
    if (!S) return;
    S.oathPending = false;
    if (ok) {
      // The axe-oath badge pays its own 10 Oofbux and raises its own toast from game.js's
      // award, so this is a sound and a repaint and nothing else.
      sfx("fanfare");
    } else {
      sfx("denied");
      toast({ variant: "error", icon: "🪓", title: "The oath cannot be sworn right now" });
    }
    repaint();
  });
  row.append(cancel, swear);
  wrap.appendChild(row);
  return wrap;
}

// CLAIM YOUR WINGS. It spends nothing and is safe to press repeatedly: all it does is
// re-attempt the Catalog grant (§10.4, §16.11), which is idempotent and answers
// { ok:true, alreadyOwned:true } for an item already owned. Shown only while the unlock is
// earned and the Catalog item is not yet on the account.
function wingsControl(unlocks) {
  if (!unlocks.fly) {
    return el("div", `font:400 12px/16px system-ui;color:${DIM};`,
      "Flight and the wings arrive together, at " + TUNE.FLY_UNLOCK_WINS + " lifetime wins.");
  }
  if (avatarOwns(WINGS_CATALOG_ID)) {
    return el("div", `font:700 13px/18px system-ui;color:${SKY};`,
      "Claimed. The wings are on your avatar in every Place, and 🕊 flies you around Showdown.");
  }
  const btn = pushButton("CLAIM YOUR WINGS", false, SKY, "#0c0e14");
  btn.addEventListener("click", () => {
    if (!S) return;
    let ok = false;
    if (typeof S.handlers.onClaimWings === "function") {
      try { ok = S.handlers.onClaimWings() === true; } catch (err) {
        console.warn("[oof] showdown shops: onClaimWings failed", err);
      }
    }
    if (!S) return;
    if (ok) {
      // grantItem raises its own "Unlocked: ..." toast, so this Place never toasts on top
      // of it (§16.11). A sound and a repaint are the whole response.
      sfx("sparkle");
    } else {
      sfx("denied");
      toast({
        icon: "🕊️", title: "Not worn everywhere yet",
        body: "Your wings are flying inside Showdown. The claim is re-attempted every time you press this.",
      });
    }
    repaint();
  });
  return btn;
}

// =====================================================================================
// Small DOM helpers. No innerHTML anywhere, inline styles only, and every tappable thing
// is at least TUNE.TOUCH_MIN_PX across (§15). The panel itself is the platform's surface,
// so there is no game-owned DOM root here and nothing for dispose to remove but the panel.
// =====================================================================================

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function pushButton(label, disabled, background, colour) {
  const btn = el("button", "flex:1;border:0;border-radius:10px;cursor:pointer;"
    + "font:800 14px/1 system-ui;padding:0 14px;"
    + `min-height:${TUNE.TOUCH_MIN_PX}px;min-width:${TUNE.TOUCH_MIN_PX}px;`
    + `background:${background || "var(--oof-surface, #171a24)"};color:${colour || TEXT};`
    + (disabled ? "opacity:0.45;cursor:default;" : ""), label);
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  if (disabled) btn.disabled = true;
  return btn;
}

function statLine(icon, label, value) {
  const row = el("div", "display:flex;align-items:center;gap:8px;padding:4px 0;");
  row.appendChild(el("div", "font:700 16px/20px system-ui;width:24px;text-align:center;", icon));
  row.appendChild(el("div", `flex:1;font:400 13px/18px system-ui;color:${DIM};`, label));
  row.appendChild(el("div", `font:800 15px/20px system-ui;color:${TEXT};`, value));
  return row;
}

// A progress bar for the two unlock bars. The fraction is clamped, because points can run
// past a hundred and wins past a thousand and a bar wider than its track is a rendering
// bug rather than a brag.
function meter(fraction, colour) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const track = el("div", "height:10px;border-radius:5px;overflow:hidden;background:var(--oof-bg, #0e1018);");
  track.appendChild(el("div", `height:10px;border-radius:5px;background:${colour};width:${(f * 100).toFixed(1)}%;`));
  return track;
}

function noteCard(text) {
  return el("div", `${CARD}font:400 13px/18px system-ui;color:${DIM};`, text);
}

function balanceRow() {
  const row = el("div", "display:flex;align-items:center;gap:8px;margin:0 0 10px;");
  row.appendChild(el("div", `flex:1;font:400 13px/18px system-ui;color:${DIM};`, "Your Oofbux"));
  row.appendChild(el("div", `font:800 16px/20px system-ui;color:${GOLD};`, fmt(balance())));
  return row;
}

function weaponGroup(title, rows) {
  const group = el("div", "margin:8px 0 0;");
  if (!rows.length) return group;
  group.appendChild(el("div", `font:700 13px/18px system-ui;color:${TEXT};margin:6px 0 2px;`, title));
  for (const w of rows) {
    const line = el("div", "padding:4px 0;");
    line.appendChild(el("div", `font:700 13px/18px system-ui;color:${TEXT};`, w.icon + " " + w.name));
    line.appendChild(el("div", `font:400 12px/16px system-ui;color:${DIM};`,
      w.tier + " · " + w.damage + " damage · " + w.range + " reach · " + w.arcDeg + "° arc · " + w.cooldownS + "s"));
    line.appendChild(el("div", `font:400 12px/16px system-ui;color:${DIM};`, w.desc));
    group.appendChild(line);
  }
  return group;
}

// The one line of copy at the top of each selling kiosk. Each one says the thing a player
// would otherwise have to discover by losing a round: what the purchase does, and where.
function shopNote(which) {
  if (which === "hats") {
    return "Catalog items. Bought here once, worn on your avatar in every Place you visit, not only in Showdown.";
  }
  if (which === "emotes") {
    return "Showdown only, and they play in the lobby, in the obby and after a round. An emote is refused while you are "
      + "a living fighter in a fight, and while you are watching one: " + TUNE.EMOTE_COOLDOWN_S + "s between plays.";
  }
  return "Appearance only. A skin never changes damage, reach, arc or cooldown, and it dresses whatever you are holding.";
}

// =====================================================================================
// Thin wrappers over the services. Every one of them is optional at the call site: audio
// is a no-op before the AudioContext exists, and a throw out of a click handler would be
// swallowed by the browser and read as a dead button.
// =====================================================================================

// Five names, all from spec 02's closed 25-name registry: `purchase` on a sale, `denied` on
// a refusal, `click` on an equip, `fanfare` on the oath and `sparkle` on the wings. The name
// is passed as a variable on purpose, the way combat.js does it: rule 04:V7 reads
// playSfx("literal") call sites and validate's key extractor drops the first entry after a
// comment line in SFX_NAMES, so a literal that IS in the registry can still be reported as
// outside it. Nothing below is reached for on a guess.
function sfx(name) {
  if (!S) return;
  try { S.ctx.engine.audio.playSfx(name); } catch { /* audio is optional, always */ }
}

function toast(opts) {
  if (!S) return;
  try { S.ctx.services.ui.toast(opts); } catch { /* a missing toast must not eat the click */ }
}

function balance() {
  if (!S) return 0;
  try { return num(S.ctx.services.economy.balance()); } catch { return 0; }
}

function fmt(n) {
  if (!S) return String(num(n));
  try { return S.ctx.services.ui.formatOofbux(n); } catch { return String(num(n)); }
}

// avatar.owns is the second half of hat ownership and the whole of the wings' claim gate.
// It answers false before the avatar service has state, which is the right answer here.
function avatarOwns(itemId) {
  if (!S || !itemId) return false;
  try { return S.ctx.services.avatar.owns(itemId) === true; } catch { return false; }
}

// badges.has takes the bare suffix and the platform prefixes it with this slug, so a Place
// can never read another Place's wall. An id not yet in the registry answers false.
function badgeEarned(suffix) {
  if (!S) return false;
  try { return S.ctx.services.badges.has(suffix) === true; } catch { return false; }
}

function equippedId(kind) {
  const eq = S.save && typeof S.save.equipped === "object" && S.save.equipped ? S.save.equipped : null;
  return eq ? eq[kind] || null : null;
}

function arr(v) { return Array.isArray(v) ? v : []; }

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
