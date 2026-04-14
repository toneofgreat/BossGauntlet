-- Script: GameServer (RIVALS but MEMED)
local Players        = game:GetService("Players")
local RunService     = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting       = game:GetService("Lighting")

local WeaponData = require(ReplicatedStorage:WaitForChild("WeaponData"))
local MAPS       = WeaponData.Maps
local BOT_NAMES  = WeaponData.BotNames
local KILL_MSGS  = WeaponData.KillMessages

-- ── Remotes ──────────────────────────────────────────────────────────
local Remotes = Instance.new("Folder"); Remotes.Name="Remotes"; Remotes.Parent=ReplicatedStorage
local function mkE(n) local e=Instance.new("RemoteEvent"); e.Name=n; e.Parent=Remotes; return e end
local function mkF(n) local f=Instance.new("RemoteFunction"); f.Name=n; f.Parent=Remotes; return f end

local DamageBot   = mkE("DamageBot")    -- client→server: botModel, dmg
local KillFeed    = mkE("KillFeed")     -- server→all: killer, victim
local PlayerDied  = mkE("PlayerDied")   -- server→player: killerName
local GameWon     = mkE("GameWon")      -- server→all: winnerName
local GetLB       = mkF("GetLB")        -- server→client: leaderboard data

-- ── State ─────────────────────────────────────────────────────────────
local currentMap  = 1   -- 1 = Rizz Arena, 2 = Gigachad Graveyard (set via vote or default)
local mapFolder   = nil
local bots        = {}  -- list of bot data tables
local gameOver    = false
local kills       = {}  -- [playerName or botName] = killCount

local KILLS_TO_WIN = 15

-- ── Map Builder ───────────────────────────────────────────────────────
local function buildMap(mapIdx)
	if mapFolder then mapFolder:Destroy() end
	mapFolder = Instance.new("Folder"); mapFolder.Name="MapFolder"; mapFolder.Parent=workspace

	local mapDef = MAPS[mapIdx]

	-- Sky/fog
	Lighting.Ambient         = Color3.fromRGB(50,50,80)
	Lighting.OutdoorAmbient  = Color3.fromRGB(30,30,60)
	local sky = workspace:FindFirstChild("Sky")
	if sky then sky:Destroy() end

	Lighting.FogColor=mapDef.fogColor; Lighting.FogEnd=mapDef.fogEnd or 200; Lighting.FogStart=0

	-- Floor
	local fl = Instance.new("Part")
	fl.Name="Floor"; fl.Anchored=true; fl.CanCollide=true
	fl.Size=mapDef.floor.size; fl.CFrame=CFrame.new(mapDef.floor.pos)
	fl.BrickColor=mapDef.floor.color
	fl.Material=mapDef.floor.mat or Enum.Material.SmoothPlastic
	fl.Parent=mapFolder

	-- Boxes
	for _, bd in ipairs(mapDef.boxes) do
		local p = Instance.new("Part")
		p.Anchored=true; p.CanCollide=true
		p.Size=bd.size; p.CFrame=CFrame.new(bd.pos)
		p.BrickColor=bd.color
		p.Material=bd.mat or Enum.Material.SmoothPlastic
		p.CastShadow=true
		p.Parent=mapFolder
	end

	-- Lights
	for _, ld in ipairs(mapDef.lights) do
		local lp = Instance.new("Part")
		lp.Anchored=true; lp.CanCollide=false; lp.Transparency=1
		lp.Size=Vector3.new(1,1,1); lp.CFrame=CFrame.new(ld.pos)
		lp.Parent=mapFolder
		local pl = Instance.new("PointLight", lp)
		pl.Color=ld.color; pl.Brightness=ld.bright; pl.Range=ld.range
	end

	return mapDef.spawns
end

-- ── Bot Builder ───────────────────────────────────────────────────────
local function makeBot(name, pos, spawns)
	local m = Instance.new("Model"); m.Name=name

	local root = Instance.new("Part")
	root.Name="HumanoidRootPart"; root.Anchored=false; root.CanCollide=false
	root.Transparency=1; root.Size=Vector3.new(2,2,1)
	root.CFrame=CFrame.new(pos); root.Parent=m

	local torso = Instance.new("Part")
	torso.Name="Torso"; torso.Anchored=false; torso.CanCollide=true
	torso.Size=Vector3.new(2,2,1)
	torso.BrickColor=BrickColor.new("Bright red")
	torso.Material=Enum.Material.SmoothPlastic
	torso.CFrame=CFrame.new(pos); torso.Parent=m

	local head = Instance.new("Part")
	head.Name="Head"; head.Anchored=false; head.CanCollide=false
	head.Size=Vector3.new(1.5,1.5,1.5)
	head.BrickColor=BrickColor.new("Bright yellow")
	head.CFrame=CFrame.new(pos+Vector3.new(0,1.75,0)); head.Parent=m

	-- Welds
	local w1=Instance.new("WeldConstraint"); w1.Part0=root; w1.Part1=torso; w1.Parent=m
	local w2=Instance.new("WeldConstraint"); w2.Part0=root; w2.Part1=head;  w2.Parent=m

	-- Keep bot on ground with a floor constraint
	local bg=Instance.new("BodyGyro",root); bg.MaxTorque=Vector3.new(1e5,0,1e5); bg.P=1e4; bg.CFrame=CFrame.new()

	-- HP value
	local hp=Instance.new("NumberValue",m); hp.Name="HP"; hp.Value=100

	-- Tag
	local isBot=Instance.new("BoolValue",m); isBot.Name="IsBot"; isBot.Value=true

	-- Billboard name
	local bg2=Instance.new("BillboardGui",head); bg2.Size=UDim2.new(0,120,0,28); bg2.StudsOffset=Vector3.new(0,1.5,0); bg2.AlwaysOnTop=false
	local lbl=Instance.new("TextLabel",bg2); lbl.Size=UDim2.new(1,0,1,0)
	lbl.Text=name; lbl.TextScaled=true; lbl.Font=Enum.Font.GothamBold
	lbl.TextColor3=Color3.fromRGB(255,80,80); lbl.BackgroundTransparency=1

	m.PrimaryPart=root; m.Parent=workspace

	kills[name]=0

	return {
		model=m, root=root, torso=torso, head=head, hpVal=hp,
		name=name, alive=true, deaths=0,
		shootTimer=1+math.random()*2,
		moveTimer=0, moveDir=Vector3.new(1,0,0),
		spawns=spawns,
	}
end

-- ── Bot respawn ───────────────────────────────────────────────────────
local function respawnBot(bot)
	local sp=bot.spawns[math.random(#bot.spawns)]
	local cf=CFrame.new(sp+Vector3.new(math.random(-3,3),0,math.random(-3,3)))
	bot.root.CFrame=cf
	bot.hpVal.Value=100
	bot.alive=true
	bot.model:FindFirstChild("Head").BrickColor=BrickColor.new("Bright yellow")
	bot.model:FindFirstChild("Torso").BrickColor=BrickColor.new("Bright red")
end

-- ── Damage Bot Remote ─────────────────────────────────────────────────
DamageBot.OnServerEvent:Connect(function(player, botModel, dmg, weaponId)
	if gameOver then return end
	if not botModel or not botModel.Parent then return end
	local bot=nil
	for _,b in ipairs(bots) do if b.model==botModel then bot=b; break end end
	if not bot or not bot.alive then return end

	-- Clamp damage (anti-cheat lite)
	dmg=math.min(dmg,250)
	bot.hpVal.Value=bot.hpVal.Value-dmg
	-- Flash head
	bot.head.BrickColor=BrickColor.new("Bright orange")
	task.delay(0.1,function() if bot.head then bot.head.BrickColor=BrickColor.new("Bright yellow") end end)

	if bot.hpVal.Value<=0 and bot.alive then
		bot.alive=false
		bot.deaths=bot.deaths+1
		bot.head.BrickColor=BrickColor.new("Dark stone grey")
		bot.torso.BrickColor=BrickColor.new("Dark stone grey")

		local killer=player.Name
		kills[killer]=(kills[killer]or 0)+1

		-- Update leaderstats
		local ls=player:FindFirstChild("leaderstats")
		if ls then
			local k=ls:FindFirstChild("Kills"); if k then k.Value=kills[killer] end
		end

		-- Kill feed to all
		KillFeed:FireAllClients(killer, bot.name)

		if kills[killer]>=KILLS_TO_WIN and not gameOver then
			gameOver=true
			GameWon:FireAllClients(killer)
		end

		-- Respawn bot after 3s
		task.delay(3, function() if bot then respawnBot(bot) end end)
	end
end)

-- ── Leaderstats ────────────────────────────────────────────────────────
Players.PlayerAdded:Connect(function(player)
	local ls=Instance.new("Folder"); ls.Name="leaderstats"; ls.Parent=player
	local k=Instance.new("NumberValue",ls); k.Name="Kills"; k.Value=0
	local d=Instance.new("NumberValue",ls); d.Name="Deaths"; d.Value=0
	kills[player.Name]=0
end)

Players.PlayerRemoving:Connect(function(player)
	kills[player.Name]=nil
end)

GetLB.OnServerInvoke=function()
	local t={}
	for name,k in pairs(kills) do
		table.insert(t,{name=name,kills=k})
	end
	-- add bots
	for _,b in ipairs(bots) do
		table.insert(t,{name=b.name,kills=kills[b.name]or 0,deaths=b.deaths,isBot=true})
	end
	table.sort(t,function(a,b) return (a.kills or 0)>(b.kills or 0) end)
	return t
end

-- ── Bot AI Loop ────────────────────────────────────────────────────────
local spawnList = {}

-- Build map immediately on server start
do
	-- Select map (default 1, Rizz Arena)
	spawnList = buildMap(currentMap)

	-- Spawn bots
	for i,name in ipairs(BOT_NAMES) do
		local sp=spawnList[((i-1)%#spawnList)+1]
		local bot=makeBot(name, sp+Vector3.new(0,1,0), spawnList)
		table.insert(bots,bot)
	end

	-- Spawn all current players
	for _,player in ipairs(Players:GetPlayers()) do
		local sp=spawnList[math.random(#spawnList)]
		if player.Character then
			local hrp=player.Character:FindFirstChild("HumanoidRootPart")
			if hrp then hrp.CFrame=CFrame.new(sp+Vector3.new(0,3,0)) end
		end
	end
end

-- ── Bot physics loop ──────────────────────────────────────────────────
local function getNearestPlayer(pos)
	local best,bestDist=nil,math.huge
	for _,p in ipairs(Players:GetPlayers()) do
		if p.Character then
			local hrp=p.Character:FindFirstChild("HumanoidRootPart")
			if hrp then
				local d=(hrp.Position-pos).Magnitude
				if d<bestDist then bestDist=d; best={player=p,pos=hrp.Position,dist=d} end
			end
		end
	end
	return best
end

RunService.Heartbeat:Connect(function(dt)
	for _,bot in ipairs(bots) do
		if not bot.alive then
			-- respawn countdown handled elsewhere
		else
		local pos=bot.root.CFrame.Position
		local target=getNearestPlayer(pos)

		if target and target.dist<60 then
			-- Chase
			local dir=(target.pos-pos)*Vector3.new(1,0,1)
			if dir.Magnitude>0.1 then
				dir=dir.Unit
				local newPos=pos+dir*dt*10
				newPos=Vector3.new(newPos.X,0.8,newPos.Z) -- keep on ground
				bot.root.CFrame=CFrame.new(newPos,newPos+dir)
			end

			-- Shoot
			bot.shootTimer-=dt
			if bot.shootTimer<=0 and target.dist<40 then
				bot.shootTimer=1.2+math.random()*1.5
				-- Check line of sight
				local rp=RaycastParams.new()
				rp.FilterDescendantsInstances={bot.model, mapFolder}
				rp.FilterType=Enum.RaycastFilterType.Exclude
				local result=workspace:Raycast(pos+Vector3.new(0,0.5,0),(target.pos-pos).Unit*45,rp)
				if result then
					local hitChar=result.Instance:FindFirstAncestorOfClass("Model")
					if hitChar==target.player.Character then
						-- Hit the player
						local hum=target.player.Character:FindFirstChild("Humanoid")
						if hum and hum.Health>0 then
							local dmg=6+math.random()*10
							hum:TakeDamage(dmg)
						end
					end
				end
			end
		else
			-- Patrol
			bot.moveTimer-=dt
			if bot.moveTimer<=0 then
				local angle=math.random()*math.pi*2
				bot.moveDir=Vector3.new(math.cos(angle),0,math.sin(angle))
				bot.moveTimer=1.5+math.random()*2
			end
			local newPos=pos+bot.moveDir*dt*5
			newPos=Vector3.new(
				math.clamp(newPos.X,-55,55), 0.8, math.clamp(newPos.Z,-55,55)
			)
			bot.root.CFrame=CFrame.new(newPos,newPos+bot.moveDir)
		end
		end -- end else (alive)
	end
end)

-- Track player deaths for leaderboard
Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(char)
		local hum=char:WaitForChild("Humanoid")
		hum.Died:Connect(function()
			local ls=player:FindFirstChild("leaderstats")
			if ls then
				local d=ls:FindFirstChild("Deaths"); if d then d.Value=d.Value+1 end
			end
			-- Broadcast kill feed (killed by environment/bot - simplified)
			KillFeed:FireAllClients("???", player.Name)
		end)
		-- Respawn at a spawn point
		task.delay(0.1,function()
			local hrp=char:FindFirstChild("HumanoidRootPart")
			if hrp and #spawnList>0 then
				local sp=spawnList[math.random(#spawnList)]
				hrp.CFrame=CFrame.new(sp+Vector3.new(0,3,0))
			end
		end)
	end)
end)
