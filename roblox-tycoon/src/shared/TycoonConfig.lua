-- TycoonConfig: ordered list of everything you can buy in the tycoon.
-- The server reads this, lays out the plot, and reveals buttons one at a time
-- (classic Roblox tycoon gating). Costs scale ~1.5x per floor (FLOOR_MULT).

local Config = {}

Config.FLOOR_MULT      = 1.6    -- each floor is ~1.6x more expensive (progress slower per floor)
Config.COST_MULT       = 5      -- global cost scale — everything is harder to get
Config.STEAL_COOLDOWN  = 20     -- another PLAYER can steal from your cash collector once per 20s
Config.STEAL_PERCENT   = 0.5    -- fraction of un-banked cash a thieving player grabs
Config.DROP_INTERVAL   = 1.3    -- seconds between drops per dropper

-- REAL Roblox gear (classic Toolbox / catalog items). The server grants gear in
-- this priority order: (1) a Tool of the same display name placed in
-- ServerStorage.GearStorage (drag it in from the Toolbox in Studio), (2)
-- InsertService:LoadAsset(assetId) below, (3) a simple built-in fallback tool.
-- NOTE: nil ids fall through to GearStorage/fallback. Set ids you own, or just
-- drop the Toolbox tools into ServerStorage.GearStorage (most reliable).
Config.gearAssets = {
  speed   = 16688561,    -- Speed Coil
  gravity = 16688968,    -- Gravity Coil
  jump    = nil,         -- (uses a built-in jump boost)
  sword   = 125013769,   -- Linked Sword
  carpet  = nil,         -- Flying Carpet  -> set your assetId or use GearStorage
  grenade = nil,         -- Hand Grenade   -> "
  laser   = nil,         -- Laser Gun      -> "
  rocket  = nil,         -- Rocket Launcher-> "
}
Config.PLOT_SPACING    = 220    -- studs between player plots
Config.FLOOR_HEIGHT    = 28     -- vertical gap between floors

-- color helper
local function C(r,g,b) return Color3.fromRGB(r,g,b) end

-- Ordered buy list. kind:
--   dropper       {value, color}        spawns ore worth `value`
--   upgrader      {mult, color}         multiplies ore that passes it (smasher/ray)
--   collector     {}                    ore that reaches it adds to UN-banked cash
--   cashcollector {}                    step on it to BANK un-banked cash (safe from robbers)
--   wall/floorslab/deco {color, label}  decoration / unlocks the next floor visually
--   gear          {gear}               gives a tool: "speed", "jump", "sword"
--   nuke          {}                    final, most expensive: "crashes the server" then rebirth
Config.buttons = {
  -- ============ FLOOR 1 — Starter Base ============
  {floor=1, kind="dropper",  name="Gray Dropper",       baseCost=0,      value=1,   color=C(150,150,150)},
  {floor=1, kind="dropper",  name="Block Dropper",      baseCost=25,     value=2,   color=C(90,90,90)},
  {floor=1, kind="dropper",  name="White Dropper",      baseCost=70,     value=3,   color=C(240,240,240)},
  {floor=1, kind="dropper",  name="Light Green Dropper",baseCost=160,    value=5,   color=C(150,240,150)},
  {floor=1, kind="dropper",  name="Green Dropper",      baseCost=320,    value=8,   color=C(40,200,70)},
  {floor=1, kind="dropper",  name="Yellow Dropper",     baseCost=620,    value=13,  color=C(245,220,60)},
  {floor=1, kind="dropper",  name="Orange Dropper",     baseCost=1100,   value=21,  color=C(245,150,40)},
  {floor=1, kind="dropper",  name="Red Dropper",        baseCost=1900,   value=34,  color=C(220,50,50)},
  {floor=1, kind="upgrader", name="Smasher (x2)",       baseCost=3200,   mult=2,    color=C(120,120,140)},
  {floor=1, kind="wall",     name="Barricades",         baseCost=2000,   color=C(110,90,70)},
  {floor=1, kind="gear",     name="Speed Coil",         baseCost=2500,   gear="speed"},
  {floor=1, kind="gear",     name="Jump Coil",          baseCost=2800,   gear="jump"},
  {floor=1, kind="gear",     name="Sword",              baseCost=3500,   gear="sword"},
  {floor=1, kind="gear",     name="Gravity Coil",       baseCost=6000,   gear="gravity"},
  {floor=1, kind="convspeed",name="Conveyor Speed I",   baseCost=7000,   addspeed=16, color=C(90,200,255)},
  {floor=1, kind="upgrader", name="Size Ray (x3)",      baseCost=9000,   mult=3,    color=C(120,220,255)},
  {floor=1, kind="collector",name="Collector",          baseCost=1200},
  {floor=1, kind="cashcollector", name="Cash Collector",baseCost=900},
  {floor=1, kind="bridge",   name="Left Bridge (half)",  baseCost=11000, side="left"},
  {floor=1, kind="bridge",   name="Right Bridge (half)", baseCost=11000, side="right"},
  {floor=1, kind="floorslab",name="Build 2nd Floor",    baseCost=15000,  color=C(120,110,100)},

  -- ============ FLOOR 2 — Desert ============
  {floor=2, kind="wall",     name="Sandy Floor",        baseCost=20000,  color=C(225,205,140)},
  {floor=2, kind="deco",     name="Tiny Pyramid",       baseCost=24000,  color=C(225,195,120), shape="pyramid"},
  {floor=2, kind="dropper",  name="Light Yellow Dropper",baseCost=30000, value=70,  color=C(250,240,160)},
  {floor=2, kind="dropper",  name="Dark Yellow Dropper",baseCost=48000,  value=110, color=C(210,180,40)},
  {floor=2, kind="dropper",  name="Desert Dropper",     baseCost=75000,  value=170, color=C(220,190,110)},
  {floor=2, kind="dropper",  name="Desert Dropper II",  baseCost=110000, value=240, color=C(205,175,95)},
  {floor=2, kind="upgrader", name="Mummy Smasher (x4)", baseCost=180000, mult=4,    color=C(230,225,200)},
  {floor=2, kind="upgrader", name="Book Ray (x6)",      baseCost=320000, mult=6,    color=C(180,120,80)},
  {floor=2, kind="deco",     name="Mummy",              baseCost=90000,  color=C(220,215,190), shape="mummy"},
  {floor=2, kind="collector",name="Desert Collector",   baseCost=60000},
  {floor=2, kind="cashcollector", name="Desert Cash Collector", baseCost=55000},
  {floor=2, kind="convspeed",name="Conveyor Speed II",  baseCost=260000, addspeed=22, color=C(120,210,255)},
  {floor=2, kind="floorslab",name="Build 3rd Floor",    baseCost=600000, color=C(40,40,55)},

  -- ============ FLOOR 3 — Glowing Hearts ============
  {floor=3, kind="wall",     name="Glowing Black Floor",baseCost=750000, color=C(20,20,28), glow=true},
  {floor=3, kind="dropper",  name="Red Heart Dropper",  baseCost=900000, value=900, color=C(255,60,90),  shape="heart"},
  {floor=3, kind="dropper",  name="Orange Heart Dropper",baseCost=1300000,value=1300,color=C(255,150,40), shape="heart"},
  {floor=3, kind="dropper",  name="Blue Heart Dropper", baseCost=2000000,value=2000, color=C(70,140,255), shape="heart"},
  {floor=3, kind="dropper",  name="Purple Heart Dropper",baseCost=3000000,value=3200,color=C(180,80,255), shape="heart"},
  {floor=3, kind="upgrader", name="Mega Smasher (x8)",  baseCost=5000000,mult=8,    color=C(255,80,160)},
  {floor=3, kind="collector",name="Heart Collector",    baseCost=1500000},
  {floor=3, kind="cashcollector", name="Heart Cash Collector", baseCost=1400000},
  {floor=3, kind="convspeed",name="Conveyor Speed III", baseCost=8000000,  addspeed=30, color=C(180,120,255)},
  {floor=3, kind="gear",     name="Flying Carpet",      baseCost=12000000, gear="carpet"},
  {floor=3, kind="gear",     name="Hand Grenade",       baseCost=20000000, gear="grenade"},
  {floor=3, kind="gear",     name="Rocket Launcher",    baseCost=35000000, gear="rocket"},
  {floor=3, kind="gear",     name="Laser Gun",          baseCost=50000000, gear="laser"}, -- 2nd most expensive
  {floor=3, kind="nuke",     name="LAUNCH NUKE",        baseCost=1000000000},             -- most expensive (way more)
}

return Config
