-- ModuleScript: WeaponData
return {
	Weapons = {
		{id="sigma", name="Sigma Blaster",       emoji="🔫", type="auto",  dmg=22,  ammo=30,  fr=0.10, reload=1.8, range=300, spread=0.04, color=BrickColor.new("Bright blue"),   col=Color3.fromRGB(68,136,255)},
		{id="ratio", name="Ratio Rifle",          emoji="📡", type="semi",  dmg=150, ammo=5,   fr=1.2,  reload=2.5, range=500, spread=0.005,color=BrickColor.new("Reddish brown"), col=Color3.fromRGB(255,136,68),  zoom=true},
		{id="sussy", name="Sussy Shotgun",        emoji="🟥", type="semi",  dmg=14,  ammo=8,   fr=0.8,  reload=2.0, range=60,  spread=0.15, color=BrickColor.new("Bright red"),    col=Color3.fromRGB(255,68,0),    pellets=8},
		{id="skill", name="Skill Issue Pistol",   emoji="💀", type="semi",  dmg=40,  ammo=12,  fr=0.3,  reload=1.5, range=250, spread=0.02, color=BrickColor.new("Mid gray"),      col=Color3.fromRGB(180,180,180)},
		{id="npc",   name="NPC Destroyer 9000",   emoji="🤖", type="auto",  dmg=8,   ammo=100, fr=0.05, reload=3.0, range=150, spread=0.09, color=BrickColor.new("Bright orange"), col=Color3.fromRGB(255,136,0)},
		{id="knife", name="No Cap Knife",         emoji="🔪", type="melee", dmg=200, ammo=-1,  fr=0.5,  reload=0,   range=8,   spread=0,    color=BrickColor.new("White"),         col=Color3.fromRGB(220,220,220)},
		{id="bruh",  name="Bruh Bomb",            emoji="💥", type="semi",  dmg=90,  ammo=3,   fr=1.5,  reload=2.5, range=200, spread=0.01, color=BrickColor.new("Bright red"),    col=Color3.fromRGB(255,0,50),    explosive=true},
		{id="rizz",  name="W Rizz Rifle",         emoji="🌊", type="burst", dmg=20,  ammo=24,  fr=0.5,  reload=1.8, range=280, spread=0.04, color=BrickColor.new("Cyan"),          col=Color3.fromRGB(0,255,255),   burst=3},
		{id="chad",  name="Gigachad Cannon",      emoji="💪", type="semi",  dmg=65,  ammo=6,   fr=1.0,  reload=2.2, range=350, spread=0.01, color=BrickColor.new("Bright yellow"), col=Color3.fromRGB(255,204,0)},
		{id="grass", name="Touch Grass Bow",      emoji="🏹", type="semi",  dmg=100, ammo=10,  fr=1.0,  reload=2.0, range=400, spread=0.005,color=BrickColor.new("Bright green"),  col=Color3.fromRGB(0,170,68)},
	},

	BotNames = {"xX_NPC_Xx","Rizzless_Larry","Cringe_Kevin","Skill_Issue_Sam","L_Bozo_Bot","Copium_Chad","No_Bitties_Bob"},

	KillMessages = {
		"{k} got ratio'd by {v}","{k} has no bitches","{k} caught an L",
		"{k} is literally an NPC","{k} got skill issued by {v}",
		"{v} deleted {k}","{k} just isn't built different","{k} took the L fr fr",
	},

	Maps = {
		{
			name = "RIZZ ARENA",
			skyColor = Color3.fromRGB(20,0,40),
			fogColor = Color3.fromRGB(20,0,40), fogEnd = 200,
			floor = {size=Vector3.new(120,2,120), pos=Vector3.new(0,-1,0), color=BrickColor.new("Dark indigo"), mat=Enum.Material.SmoothPlastic},
			spawns = {Vector3.new(0,1,-40), Vector3.new(0,1,40), Vector3.new(-40,1,0), Vector3.new(40,1,0), Vector3.new(-25,1,-25), Vector3.new(25,1,25), Vector3.new(-25,1,25), Vector3.new(25,1,-25)},
			boxes = {
				-- outer walls
				{size=Vector3.new(120,12,2), pos=Vector3.new(0,5,-60), color=BrickColor.new("Dark indigo")},
				{size=Vector3.new(120,12,2), pos=Vector3.new(0,5,60),  color=BrickColor.new("Dark indigo")},
				{size=Vector3.new(2,12,120), pos=Vector3.new(-60,5,0), color=BrickColor.new("Dark indigo")},
				{size=Vector3.new(2,12,120), pos=Vector3.new(60,5,0),  color=BrickColor.new("Dark indigo")},
				-- center platform
				{size=Vector3.new(14,2,14), pos=Vector3.new(0,1,0),   color=BrickColor.new("Medium lilac")},
				{size=Vector3.new(8,4,8),   pos=Vector3.new(0,3,0),   color=BrickColor.new("Bright violet")},
				-- side cover
				{size=Vector3.new(10,3,3),  pos=Vector3.new(-22,1.5,0), color=BrickColor.new("Dark purple")},
				{size=Vector3.new(10,3,3),  pos=Vector3.new(22,1.5,0),  color=BrickColor.new("Dark purple")},
				{size=Vector3.new(3,3,10),  pos=Vector3.new(0,1.5,-22), color=BrickColor.new("Dark purple")},
				{size=Vector3.new(3,3,10),  pos=Vector3.new(0,1.5,22),  color=BrickColor.new("Dark purple")},
				-- corner boxes
				{size=Vector3.new(5,5,5),   pos=Vector3.new(-35,2.5,-35), color=BrickColor.new("Violet")},
				{size=Vector3.new(5,5,5),   pos=Vector3.new(35,2.5,35),   color=BrickColor.new("Violet")},
				{size=Vector3.new(5,5,5),   pos=Vector3.new(-35,2.5,35),  color=BrickColor.new("Violet")},
				{size=Vector3.new(5,5,5),   pos=Vector3.new(35,2.5,-35),  color=BrickColor.new("Violet")},
				-- pillars
				{size=Vector3.new(3,12,3),  pos=Vector3.new(-50,6,-50), color=BrickColor.new("Medium lilac"), mat=Enum.Material.Neon},
				{size=Vector3.new(3,12,3),  pos=Vector3.new(50,6,50),   color=BrickColor.new("Medium lilac"), mat=Enum.Material.Neon},
				{size=Vector3.new(3,12,3),  pos=Vector3.new(-50,6,50),  color=BrickColor.new("Medium lilac"), mat=Enum.Material.Neon},
				{size=Vector3.new(3,12,3),  pos=Vector3.new(50,6,-50),  color=BrickColor.new("Medium lilac"), mat=Enum.Material.Neon},
			},
			lights = {
				{pos=Vector3.new(0,20,0),    color=Color3.fromRGB(200,0,255), bright=3, range=120},
				{pos=Vector3.new(-30,10,-30),color=Color3.fromRGB(255,0,150), bright=2, range=60},
				{pos=Vector3.new(30,10,30),  color=Color3.fromRGB(0,255,150), bright=2, range=60},
				{pos=Vector3.new(-30,10,30), color=Color3.fromRGB(255,100,0), bright=1.5,range=50},
				{pos=Vector3.new(30,10,-30), color=Color3.fromRGB(0,100,255), bright=1.5,range=50},
			},
		},
		{
			name = "GIGACHAD GRAVEYARD",
			skyColor = Color3.fromRGB(2,2,10),
			fogColor = Color3.fromRGB(5,3,15), fogEnd = 150,
			floor = {size=Vector3.new(160,2,160), pos=Vector3.new(0,-1,0), color=BrickColor.new("Black"), mat=Enum.Material.Grass},
			spawns = {Vector3.new(0,1,-45), Vector3.new(0,1,45), Vector3.new(-45,1,0), Vector3.new(45,1,0), Vector3.new(-30,1,-30), Vector3.new(30,1,30), Vector3.new(-30,1,30), Vector3.new(30,1,-30)},
			boxes = {
				-- outer walls
				{size=Vector3.new(160,10,2), pos=Vector3.new(0,4,-80),  color=BrickColor.new("Really black")},
				{size=Vector3.new(160,10,2), pos=Vector3.new(0,4,80),   color=BrickColor.new("Really black")},
				{size=Vector3.new(2,10,160), pos=Vector3.new(-80,4,0),  color=BrickColor.new("Really black")},
				{size=Vector3.new(2,10,160), pos=Vector3.new(80,4,0),   color=BrickColor.new("Really black")},
				-- gravestones
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(10,2,6),    color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-10,2,8),   color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-15,2,-5),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(12,2,-10),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-8,2,-14),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(5,2,18),    color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-20,2,12),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(18,2,-17),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-12,2,20),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(22,2,5),    color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-22,2,-8),  color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(0,2,-22),   color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(0,2,22),    color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-25,2,0),   color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(25,2,0),    color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(15,2,15),   color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(-15,2,-15), color=BrickColor.new("Dark stone grey")},
				{size=Vector3.new(2,4,0.6),   pos=Vector3.new(8,2,-20),   color=BrickColor.new("Dark stone grey")},
				-- trees (trunks)
				{size=Vector3.new(1.5,14,1.5),pos=Vector3.new(-35,6,-35), color=BrickColor.new("Dark orange"), mat=Enum.Material.Wood},
				{size=Vector3.new(1.5,14,1.5),pos=Vector3.new(35,6,35),   color=BrickColor.new("Dark orange"), mat=Enum.Material.Wood},
				{size=Vector3.new(1.5,14,1.5),pos=Vector3.new(-35,6,35),  color=BrickColor.new("Dark orange"), mat=Enum.Material.Wood},
				{size=Vector3.new(1.5,14,1.5),pos=Vector3.new(35,6,-35),  color=BrickColor.new("Dark orange"), mat=Enum.Material.Wood},
				-- big cover rocks
				{size=Vector3.new(6,4,4),     pos=Vector3.new(-30,2,10),  color=BrickColor.new("Dark stone grey"), mat=Enum.Material.SmoothPlastic},
				{size=Vector3.new(6,4,4),     pos=Vector3.new(30,2,-10),  color=BrickColor.new("Dark stone grey"), mat=Enum.Material.SmoothPlastic},
				{size=Vector3.new(4,4,6),     pos=Vector3.new(10,2,30),   color=BrickColor.new("Dark stone grey"), mat=Enum.Material.SmoothPlastic},
				{size=Vector3.new(4,4,6),     pos=Vector3.new(-10,2,-30), color=BrickColor.new("Dark stone grey"), mat=Enum.Material.SmoothPlastic},
			},
			lights = {
				{pos=Vector3.new(0,30,0),    color=Color3.fromRGB(100,100,200), bright=1, range=200},
				{pos=Vector3.new(-30,8,-30), color=Color3.fromRGB(80,0,180),    bright=2.5, range=50},
				{pos=Vector3.new(30,8,30),   color=Color3.fromRGB(0,180,100),   bright=1.5, range=50},
				{pos=Vector3.new(-30,8,30),  color=Color3.fromRGB(180,0,80),    bright=1.5, range=50},
				{pos=Vector3.new(30,8,-30),  color=Color3.fromRGB(0,80,180),    bright=1.5, range=50},
			},
		},
	},
}
