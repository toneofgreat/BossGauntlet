-- Config: single source of every number in Weight Lifting Simulator.
-- Q = 1e15 (quadrillion), Qi = 1e18 (quintillion), Sx = 1e21 (sextillion).
local Config = {}

-- {id, name, cost, power, world, req, desc}
-- world: "gym" | "space" | "dumbbell" | "lava"
-- req: nil | "r1" | "r2" | "space" | "r4" | "dumbbell" | "lava"
Config.Items = {
	{id="pencil", name="Pencil", cost=0, power=1, world="gym", req=nil,
		desc="A real No. 2 pencil - yellow, sharpened, pink eraser. Everyone starts somewhere."},
	{id="rock", name="Rock", cost=50, power=2, world="gym", req=nil,
		desc="A chunky gray rock straight off the ground. Heavier than it looks."},
	{id="book", name="Book", cost=250, power=4, world="gym", req=nil,
		desc="A thick hardcover book. Knowledge is power. Literally, in here."},
	{id="lamp", name="Small Lamp", cost=1250, power=5, world="gym", req=nil,
		desc="A little desk lamp with a warm glowing bulb. Unplugged, probably."},
	{id="candle", name="Candle", cost=10000, power=20, world="gym", req="r1",
		desc="Tiny but literally on fire. Burns you 1 HP per second unless you have 100K strength!"},
	{id="tv", name="TV", cost=35000, power=35, world="gym", req="r1",
		desc="A big flatscreen TV, remote included. Do NOT drop it."},
	{id="house", name="House", cost=1000000, power=50, world="gym", req="r1",
		desc="An entire house. Roof, door, windows, chimney. You lift it."},
	{id="cybertruck", name="Cybertruck", cost=2000000, power=70, world="gym", req="r2",
		desc="A stainless steel triangle truck. Shatterproof windows not included."},
	{id="tree", name="Tree", cost=5000000, power=100, world="gym", req="r2",
		desc="A full-grown tree, roots and all. Nature is heavy."},
	{id="train", name="Train", cost=25000000, power=400, world="gym", req="r2",
		desc="A whole locomotive with a coal car. All aboard the gain train."},
	{id="moon", name="Moon", cost=125000000, power=550, world="space", req="space",
		desc="The actual Moon. Craters, dust and all. One small lift for man..."},
	{id="pluto", name="Pluto", cost=225000000, power=750, world="space", req="space",
		desc="Still a planet in our hearts. Icy, tiny, extremely liftable."},
	{id="mars", name="Mars", cost=350000000, power=1000, world="space", req="space",
		desc="The red planet, polar ice caps included. Rover sold separately."},
	{id="earth", name="Earth", cost=500000000, power=1500, world="space", req="space",
		desc="Home sweet home - oceans, continents, clouds. Careful with it."},
	{id="neptune", name="Neptune", cost=750000000, power=2500, world="space", req="space",
		desc="A deep-blue ice giant with howling winds. Very cold. Very heavy."},
	{id="jupiter", name="Jupiter", cost=1e9, power=4000, world="space", req="space",
		desc="The biggest planet, Great Red Spot and all. 318 Earths of gains."},
	{id="sun", name="Sun", cost=3e9, power=8000, world="space", req="space",
		desc="A blazing ball of plasma. Do not look directly at your dumbbell."},
	{id="blackhole", name="Black Hole", cost=100e12, power=14000, world="space", req="r4",
		desc="Infinite density, swirling accretion disk. It lifts back."},
	{id="protein", name="Protein Bar", cost=0, power=0.1, world="dumbbell", req="dumbbell",
		desc="Chocolate flavored, 20g protein. The humble beginning... again."},
	{id="dumbbell", name="Dumbbell", cost=1000, power=1, world="dumbbell", req="dumbbell",
		desc="A real hex dumbbell. Finally, actual gym equipment."},
	{id="pushups", name="Pushup Bars", cost=100000, power=5, world="dumbbell", req="dumbbell",
		desc="A pair of steel pushup bars. The floor is your enemy now."},
	{id="situps", name="Situp Bench", cost=1e9, power=150, world="dumbbell", req="dumbbell",
		desc="An inclined situp bench with padded rollers. Core of steel."},
	{id="universe", name="The Universe", cost=10e15, power=10000, world="dumbbell", req="dumbbell",
		desc="Every galaxy, star and atom in one swirling ball. Yes, you are also in it."},
	{id="lavaball", name="Lava Ball", cost=10e15, power=15000, world="lava", req="lava",
		desc="A roiling sphere of molten rock. Oven mitts strongly recommended."},
	{id="lavaplanet", name="Lava Planet", cost=1e18, power=125000, world="lava", req="lava",
		desc="An entire world of magma oceans and obsidian crust."},
	{id="lavaeclipse", name="Lava Eclipse", cost=10e18, power=150000, world="lava", req="lava",
		desc="A burning sun eclipsed by a molten moon - a ring of pure fire."},
	{id="gdstar", name="GD Star", cost=1e21, power=450000, world="lava", req="lava",
		desc="The legendary golden star. The final lift. Shines brighter than the sun."},
}

-- Rebirths. Multi = Ladder[level] * (space and 3) * (dumbbellMulti and 50000) * (lava and 40)
Config.Ladder = {[0]=1, [1]=3, [2]=15, [3]=125, [4]=50000}
Config.Rebirths = {
	r1  = {name="Rebirth 1", cost=2500, level=1,
		blurb="x3 multiplier. Resets your strength and items."},
	r2  = {name="Rebirth 2", cost=1200000, level=2,
		blurb="x15 multiplier + unlocks the AUTOCLICKER (auto-lift every 0.2s, forever). Resets strength and items."},
	r3  = {name="Rebirth 3", cost=100e6, level=3,
		blurb="x125 multiplier + unlocks the SPACE WORLD (permanent extra x3). Resets strength and items."},
	r4  = {name="Rebirth 4", cost=15e9, level=4,
		blurb="x50,000 multiplier (replaces x125). Resets strength and items."},
	r5  = {name="Rebirth 5", cost=1e15, level=0,
		blurb="Unlocks the DUMBBELL WORLD... but resets strength, items AND all your rebirths. The ultimate sacrifice."},
	r5b = {name="Rebirth 5 *", cost=1e15, level=nil,
		blurb="Permanent x50,000 DUMBBELL MULTI. Only takes your strength this time - items and rebirths are safe."},
	r6  = {name="Rebirth 6", cost=50e15, level=nil,
		blurb="Permanent x40 multi + unlocks the LAVA ZONE gate in the gym world. Takes your strength only."},
}

-- Size milestones on CURRENT strength: {points, scale}
Config.Sizes = {
	{1e3, 2.0}, {1e4, 2.5}, {1e5, 3.0}, {1e6, 3.5}, {5e6, 4.0}, {1e7, 4.25},
	{1e8, 4.5}, {1e9, 4.75}, {1e10, 5.0}, {1e11, 5.5}, {1e12, 6}, {1e13, 8},
	{1e14, 10}, {1e15, 12}, {1e16, 14}, {1e17, 15}, {1e18, 16}, {1e19, 18},
	{1e20, 20}, {1e21, 22}, {1e22, 25},
}

-- Titles on LIFETIME strength: {points, name, color {r,g,b} 0-255, morph}
Config.Titles = {
	{1, "Noobie", {170,170,170}, false},
	{1e3, "Starter", {255,255,255}, false},
	{2e3, "Beginner", {170,255,127}, false},
	{3e3, "Rookie", {60,200,60}, false},
	{5e5, "Pro", {0,230,255}, false},
	{150e6, "Hacker", {0,255,70}, false},
	{5e9, "1010101", {0,255,0}, false},
	{125e9, "Bot", {100,140,210}, false},
	{200e9, "Hecker", {255,40,40}, false},
	{100e12, "God", {255,215,0}, false},
	{1e20, "The Rock", {160,160,155}, true}, -- also unlocks the Rock Morph
}

Config.Auras = {
	{id="fire", name="Fire Aura", cost=100000,
		desc="Wreathe yourself in real flames and drifting embers."},
	{id="water", name="Water Aura", cost=110000,
		desc="Cool blue droplets and a swirling ring of mist."},
	{id="void", name="Void Aura", cost=1e12,
		desc="Dark purple orbs orbit you. The void stares back."},
	{id="rainbowgod", name="Flying Mythical Rainbow God Aura", cost=1e21,
		desc="Angel wings, a golden halo, and rainbows everywhere. The final flex."},
}

Config.CandleSafePoints = 100000  -- 10x the candle's cost
Config.AutoInterval = 0.2         -- autoclicker lift period (seconds)
Config.ManualRateLimit = 10       -- max manual lifts per second per player

function Config.Init(G) end

function Config.ItemById(id)
	for _, it in ipairs(Config.Items) do
		if it.id == id then return it end
	end
	return nil
end

return Config
