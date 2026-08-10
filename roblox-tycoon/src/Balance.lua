-- Balance.lua -- Boss Tycoon
-- SINGLE SOURCE OF NUMBERS. Prices are fixed by the contract chain, so all
-- pacing is tuned here via drop values, intervals, upgrader mults and obby
-- rewards. Income rate of a dropper = value / interval; an upgrader changes
-- the per-drop value (value*mult+add), applied once per drop per upgrader.
--
-- ==================== INCOME-PER-STAGE ARITHMETIC =======================
--
-- PHASE 1 -- floor-1 green line (steps 4-16, prices $100-$1300)
--   auto_g: $6 per drop / 2s = $3/s per dropper; two droppers = $6/s raw.
--   Per-drop value through the floor-1 upgraders:
--     6 -> x2 (upgrader1) = 12 -> x1.5+4 (green_upgrader) = 22
--       -> x1.25 (speedy_upgrader) = 27.5
--   Both droppers fire 1 drop/s combined => income climbs 6 -> 12 -> 22
--   -> 27.5 $/s across steps 6-9. Manual green pays 8 -> 16 -> 28 -> 35 per
--   click on the same belt, roughly doubling income for an active clicker.
--   Prices $400-$750 at ~$22-27/s idle = 15-35s each (10-20s clicking).
--   The three free steps + $150 starters take ~15-25s of clicking each.
--
-- PHASE 2 -- floor-2 yellow line (steps 17-24, prices $500-$2000)
--   yellow: $45 / 2.5s = $18/s per dropper raw.
--     45 -> x2 (yellow_upgrader1) = 90 -> x2 (yellow_upgrader2) = 180
--   => $72/s per dropper fully upgraded; two autos = $144/s, plus floor 1
--   ~$27.5/s => ~$171/s. Yellow manual pays 80/160/320 per click.
--   Prices $500-$2000 land in 3-15s -- fast reward momentum mid-chain,
--   and Easy Obby repeats (+$1200) let obby-lovers skip ahead.
--
-- PHASE 3 -- balcony line (steps 25-36, prices $1100-$5000)
--   balc: $140 / 2.5s = $56/s per dropper raw; five droppers = $280/s.
--     140 -> x1.5+60 (balc_upgrader) = 270 -> x1.6 (fence_upgrader) = 432
--         -> x2 (red_upgrader) = 864
--   => $345.6/s per dropper; all five = $1728/s.
--   Running total after step 36: 27.5 + 144 + 1728 =~ $1.9K/s.
--
-- PHASE 4 -- big obbies + outside line (steps 37-45, prices $2K-$100K)
--   At $1.9K/s: hard obby $15K = 8s, intense $30K = 16s, $40K = 21s.
--   out_red: $2500 / 4s = $625/s raw -> x2.5 (out_red_upgrader) = $1562/s.
--   out_black: $8000 / 4s = $2000/s raw -> x3 (out_black_upgrader) = $6000/s.
--   Mid-phase income $3.5-5.5K/s puts the $50K-$100K pads at 15-30s each.
--   Running total after step 45: 1.9K + 1.56K + 6K =~ $9.5K/s.
--
-- PHASE 5 -- rainbow floor (steps 46-51, prices $200K-$1.5M)
--   At $9.5K/s: ladder $200K = 21s, conveyor $300K = 32s, pink $500K = 53s
--   (the intended "big save-up" beats -- intense obby repeats +$60K help).
--   pink:  $150K / 3s = $50K/s      (blue now 12s away)
--   blue:  $400K / 3s = $133K/s     (white 5s away -- power-spike montage)
--   white: $1.5M / 3s = $500K/s     => raw rainbow trio =~ $683K/s.
--   gray_upgrader is THE endgame spike: x2000 on pink/blue/white drops
--   => 683K x 2000 =~ $1.37B/s. (Biggest single drop: white 1.5M x 2000
--   = 3e9 per cube; total money peaks a few e12 -- both exact in doubles,
--   far under 2^53.)
--
-- PHASE 6 -- endgame (steps 52-68, $1M-$2T) at ~$1.37B/s
--   Steps 52-58 (sum $92.2M) and the shared furnishings 59-65 (sum $665M)
--   become an instant, satisfying build-montage; the REAL gates there are
--   adventures, not money: the lab escape (portal) and the Giant Obby
--   (code 7259), which also adds a repeatable +$25M.
--   troll_obby $1B  = under 1s to afford (gated by tv_solved anyway).
--   The troll tower itself is 20-30 min of play; the bank meanwhile grows
--   by ~1.6-2.4T => the $1T NUKE is affordable the moment troll_won lands.
--   After spending $1T, roughly $0.6-1.4T remains; the $2T EToH gate is
--   reached after ~8-17 more minutes (Giant Obby repeats speed it up).
--   Total endgame arc: ~30-60 minutes of rainbow+black income. On target.
-- ========================================================================

local M = {}
local G

function M.Init(g)
	G = g
end

-- Dropper key -> {value, interval}. Manual droppers have no interval
-- (one drop per click).
M.Drops = {
	manual_g      = { value = 8 },                  -- floor 1, free clicker
	auto_g        = { value = 6, interval = 2 },    -- $3/s each, x2 droppers
	yellow_manual = { value = 80 },                 -- floor 2 clicker
	yellow        = { value = 45, interval = 2.5 }, -- $18/s each, x2 droppers
	balc          = { value = 140, interval = 2.5 },-- $56/s each, x5 droppers
	out_red       = { value = 2500, interval = 4 }, -- $625/s
	out_black     = { value = 8000, interval = 4 }, -- $2000/s
	pink          = { value = 150000, interval = 3 },  -- $50K/s
	blue          = { value = 400000, interval = 3 },  -- $133K/s
	white         = { value = 1500000, interval = 3 }, -- $500K/s
}

-- Upgrader purchase id -> {mult, add}, applied once per drop as
-- value = value * mult + add.
M.Ups = {
	upgrader1         = { mult = 2, add = 0 },     -- green: 6 -> 12
	green_upgrader    = { mult = 1.5, add = 4 },   -- 12 -> 22
	speedy_upgrader   = { mult = 1.25, add = 0 },  -- 22 -> 27.5
	yellow_upgrader1  = { mult = 2, add = 0 },     -- yellow: 45 -> 90
	yellow_upgrader2  = { mult = 2, add = 0 },     -- 90 -> 180
	balc_upgrader     = { mult = 1.5, add = 60 },  -- balc: 140 -> 270
	fence_upgrader    = { mult = 1.6, add = 0 },   -- 270 -> 432
	red_upgrader      = { mult = 2, add = 0 },     -- 432 -> 864
	out_red_upgrader  = { mult = 2.5, add = 0 },   -- 2500 -> 6250
	out_black_upgrader = { mult = 3, add = 0 },    -- 8000 -> 24000
	gray_upgrader     = { mult = 2000, add = 0 },  -- THE spike: rainbow x2000
}

-- Paid on every completion (10s per-player cooldown lives in Obbies).
M.ObbyRewards = {
	easy    = 1200,      -- ~7s of phase-2 income; nice early boost
	medium  = 4000,      -- ~2s of phase-3 income; flavor + fun
	hard    = 18000,     -- ~9s of phase-4 income per run
	intense = 60000,     -- ~30s of income at purchase time; worth repeating
	giant   = 25000000,  -- contract-specified ~$25M endgame repeatable
}

return M
