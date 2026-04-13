-- ModuleScript: ItemData
-- All game data: items, rebirths, size milestones

return {
	Items = {
		-- {name, cost, rbReq, cpc, color1, color2, material, special}
		{name="Moon",          cost=0,       rbReq=0, cpc=1,
		 col=BrickColor.new("Medium stone grey"), mat=Enum.Material.SmoothPlastic,
		 lightCol=Color3.fromRGB(180,180,220), lightBright=0.4,
		 shape=Enum.PartType.Ball, size=Vector3.new(5,5,5), special="smiley"},

		{name="Mars",          cost=20,      rbReq=0, cpc=5,
		 col=BrickColor.new("Bright red"),   mat=Enum.Material.SmoothPlastic,
		 lightCol=Color3.fromRGB(255,100,0), lightBright=0.9,
		 shape=Enum.PartType.Ball, size=Vector3.new(5,5,5), special="fire"},

		{name="Earth",         cost=200,     rbReq=0, cpc=10,
		 col=BrickColor.new("Bright blue"),  mat=Enum.Material.SmoothPlastic,
		 lightCol=Color3.fromRGB(80,160,255),lightBright=0.7,
		 shape=Enum.PartType.Ball, size=Vector3.new(5,5,5), special="sparkles_blue"},

		{name="Neptune",       cost=1500,    rbReq=0, cpc=20,
		 col=BrickColor.new("Navy blue"),    mat=Enum.Material.SmoothPlastic,
		 lightCol=Color3.fromRGB(50,100,255),lightBright=1.0,
		 shape=Enum.PartType.Ball, size=Vector3.new(5.5,5.5,5.5), special="sparkles_blue"},

		{name="Jupiter",       cost=4000,    rbReq=0, cpc=50,
		 col=BrickColor.new("Nougat"),       mat=Enum.Material.SmoothPlastic,
		 lightCol=Color3.fromRGB(220,150,60),lightBright=0.6,
		 shape=Enum.PartType.Ball, size=Vector3.new(6,6,6), special="smoke"},

		{name="Sun",           cost=25000,   rbReq=0, cpc=75,
		 col=BrickColor.new("Bright yellow"),mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(255,230,100),lightBright=3,
		 shape=Enum.PartType.Ball, size=Vector3.new(5.5,5.5,5.5), special="sparkles"},

		{name="Red Sun",       cost=50000,   rbReq=0, cpc=100,
		 col=BrickColor.new("Bright red"),   mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(255,30,0),  lightBright=3,
		 shape=Enum.PartType.Ball, size=Vector3.new(5.5,5.5,5.5), special="fire"},

		{name="North Star",    cost=100000,  rbReq=0, cpc=250,
		 col=BrickColor.new("White"),        mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(200,220,255),lightBright=4,
		 shape=Enum.PartType.Ball, size=Vector3.new(5,5,5), special="sparkles"},

		{name="Black Hole",    cost=300000,  rbReq=0, cpc=500,
		 col=BrickColor.new("Really black"), mat=Enum.Material.Glass,
		 lightCol=Color3.fromRGB(140,0,255), lightBright=2,
		 shape=Enum.PartType.Ball, size=Vector3.new(5.5,5.5,5.5), special="sparkles_purple"},

		{name="Black Hole Bar",cost=1e6,     rbReq=0, cpc=750,
		 col=BrickColor.new("Really black"), mat=Enum.Material.Glass,
		 lightCol=Color3.fromRGB(100,0,200), lightBright=2,
		 shape=Enum.PartType.Block, size=Vector3.new(10,2.5,2.5), special="sparkles_purple"},

		{name="Aura Cube",     cost=590e9,   rbReq=4, cpc=1000,
		 col=BrickColor.new("Hot pink"),     mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(255,0,255), lightBright=3,
		 shape=Enum.PartType.Block, size=Vector3.new(5,5,5), special="rainbow"},

		{name="Godly Star",    cost=12e12,   rbReq=5, cpc=5000,
		 col=BrickColor.new("Bright yellow"),mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(255,210,0), lightBright=4,
		 shape=Enum.PartType.Ball, size=Vector3.new(5.5,5.5,5.5), special="sparkles"},

		{name="Galaxy",        cost=100e12,  rbReq=5, cpc=7500,
		 col=BrickColor.new("Medium lilac"), mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(120,60,255),lightBright=2.5,
		 shape=Enum.PartType.Ball, size=Vector3.new(6,6,6), special="sparkles_purple"},

		{name="Universe",      cost=15e15,   rbReq=8, cpc=10000,
		 col=BrickColor.new("Really black"), mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(40,40,200), lightBright=2,
		 shape=Enum.PartType.Ball, size=Vector3.new(6.5,6.5,6.5), special="sparkles_purple"},

		{name="Half's Gold",   cost=200e18,  rbReq=9, cpc=25000,
		 col=BrickColor.new("Bright yellow"),mat=Enum.Material.Neon,
		 lightCol=Color3.fromRGB(255,220,50),lightBright=4,
		 shape=Enum.PartType.Ball, size=Vector3.new(5.5,5.5,5.5), special="sparkles"},
	},

	Rebirths = {
		{name="Rebirth I",    cost=1e5,    mult=3},
		{name="Rebirth II",   cost=1e6,    mult=6},
		{name="Rebirth III",  cost=1e7,    mult=12},
		{name="Rebirth IV",   cost=1e8,    mult=100000},
		{name="Rebirth V",    cost=1e11,   mult=150000},
		{name="Rebirth VI",   cost=1e12,   mult=1000000},
		{name="Rebirth VII",  cost=5e12,   mult=50000000},
		{name="Rebirth VIII", cost=2e14,   mult=150000000},
		{name="Rebirth IX",   cost=8e15,   mult=1000000000},
		{name="Rebirth X",    cost=3.5e17, mult=3000000000},
		{name="Rebirth XI",   cost=59e18,  mult=6000000000},
	},

	SizeMilestones = {
		{str=19e3,  factor=1.5},
		{str=19e6,  factor=1.8},
		{str=1e12,  factor=2.16},
		{str=10e18, factor=2.59},
		{str=1e21,  factor=3.11},
	},
}
