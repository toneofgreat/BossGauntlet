-- LocalScript: RivalsClient (RIVALS but MEMED)
local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local UserInputService  = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui        = game:GetService("StarterGui")
local TweenService      = game:GetService("TweenService")

pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.EmotesMenu, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local WeaponData = require(ReplicatedStorage:WaitForChild("WeaponData"))
local Remotes    = ReplicatedStorage:WaitForChild("Remotes", 15)
local DamageBot  = Remotes and Remotes:WaitForChild("DamageBot")
local KillFeed   = Remotes and Remotes:WaitForChild("KillFeed")
local GameWon    = Remotes and Remotes:WaitForChild("GameWon")
local GetLB      = Remotes and Remotes:WaitForChild("GetLB")

local WEAPONS    = WeaponData.Weapons
local KILL_MSGS  = WeaponData.KillMessages

-- ═══════════════════════════════════════════════
--  STATE
-- ═══════════════════════════════════════════════
local currentWep    = 1
local weaponAmmo    = WEAPONS[1].ammo
local weaponFR      = 0
local reloading     = false
local reloadTimer   = 0
local zoomActive    = false
local gameEnded     = false
local hitmarkTimer  = 0
local burstQueue    = 0
local burstTimer    = 0
local mouseHeld     = false

-- ═══════════════════════════════════════════════
--  UTILS
-- ═══════════════════════════════════════════════
local function newUI(class, props, parent)
	local obj=Instance.new(class)
	for k,v in pairs(props) do obj[k]=v end
	if parent then obj.Parent=parent end
	return obj
end
local function corner(r,p) local c=Instance.new("UICorner"); c.CornerRadius=UDim.new(0,r); c.Parent=p end
local function fmt(n) if n>=1e6 then return string.format("%.1fm",n/1e6) elseif n>=1e3 then return string.format("%.1fk",n/1e3) else return tostring(math.floor(n)) end end

-- ═══════════════════════════════════════════════
--  GUI CONSTRUCTION
-- ═══════════════════════════════════════════════
local Gui = newUI("ScreenGui",{Name="RivalsGui",ResetOnSpawn=false,IgnoreGuiInset=true,ZIndexBehavior=Enum.ZIndexBehavior.Sibling},playerGui)

-- Background tint
local BG = newUI("Frame",{Size=UDim2.new(1,0,1,0),BackgroundTransparency=1,BorderSizePixel=0},Gui)

-- ── Crosshair ──
local XH = newUI("Frame",{Size=UDim2.new(0,20,0,20),Position=UDim2.new(0.5,-10,0.5,-10),BackgroundTransparency=1,ZIndex=10},BG)
newUI("Frame",{Size=UDim2.new(0,2,0,14),Position=UDim2.new(0.5,-1,0.5,-7),BackgroundColor3=Color3.new(1,1,1),BorderSizePixel=0},XH)
newUI("Frame",{Size=UDim2.new(0,14,0,2),Position=UDim2.new(0.5,-7,0.5,-1),BackgroundColor3=Color3.new(1,1,1),BorderSizePixel=0},XH)

-- ── Hit marker ──
local HitMark = newUI("TextLabel",{
	Size=UDim2.new(0,30,0,30),Position=UDim2.new(0.5,-15,0.5,-15),
	Text="✕",Font=Enum.Font.GothamBold,TextSize=24,
	TextColor3=Color3.fromRGB(255,50,50),BackgroundTransparency=1,
	ZIndex=11,TextXAlignment=Enum.TextXAlignment.Center,
	TextTransparency=1,
},BG)

-- ── Health bar ──
local HPBar = newUI("Frame",{Size=UDim2.new(0,240,0,14),Position=UDim2.new(0,24,1,-44),BackgroundColor3=Color3.fromRGB(20,20,20),BorderSizePixel=0,ZIndex=5},BG)
corner(7,HPBar)
local HPFill = newUI("Frame",{Size=UDim2.new(1,0,1,0),BackgroundColor3=Color3.fromRGB(50,220,80),BorderSizePixel=0,ZIndex=6},HPBar)
corner(7,HPFill)
newUI("TextLabel",{Size=UDim2.new(1,0,0,14),Position=UDim2.new(0,0,-1.2,0),Text="HP",Font=Enum.Font.GothamBold,TextSize=9,TextColor3=Color3.fromRGB(100,180,100),BackgroundTransparency=1,ZIndex=5,TextXAlignment=Enum.TextXAlignment.Left},HPBar)

-- ── Ammo display ──
local AmmoFrame = newUI("Frame",{Size=UDim2.new(0,160,0,60),Position=UDim2.new(1,-180,1,-80),BackgroundTransparency=1,ZIndex=5},BG)
local WepName = newUI("TextLabel",{Size=UDim2.new(1,0,0,18),Position=UDim2.new(0,0,0,0),Text="Sigma Blaster",Font=Enum.Font.GothamBold,TextSize=12,TextColor3=Color3.fromRGB(0,220,150),BackgroundTransparency=1,ZIndex=6,TextXAlignment=Enum.TextXAlignment.Right},AmmoFrame)
local AmmoCur = newUI("TextLabel",{Size=UDim2.new(1,0,0,28),Position=UDim2.new(0,0,0,18),Text="30",Font=Enum.Font.GothamBold,TextSize=28,TextColor3=Color3.fromRGB(255,255,255),BackgroundTransparency=1,ZIndex=6,TextXAlignment=Enum.TextXAlignment.Right},AmmoFrame)
local AmmoRes = newUI("TextLabel",{Size=UDim2.new(1,0,0,14),Position=UDim2.new(0,0,0,46),Text="/ 30",Font=Enum.Font.Gotham,TextSize=12,TextColor3=Color3.fromRGB(130,130,130),BackgroundTransparency=1,ZIndex=6,TextXAlignment=Enum.TextXAlignment.Right},AmmoFrame)

-- ── Kill counter (top right) ──
local KillDisp = newUI("Frame",{Size=UDim2.new(0,90,0,60),Position=UDim2.new(1,-110,0,14),BackgroundTransparency=1,ZIndex=5},BG)
local KillNum = newUI("TextLabel",{Size=UDim2.new(1,0,0,40),Text="0",Font=Enum.Font.GothamBold,TextSize=40,TextColor3=Color3.fromRGB(255,210,0),BackgroundTransparency=1,ZIndex=6,TextXAlignment=Enum.TextXAlignment.Center},KillDisp)
newUI("TextLabel",{Size=UDim2.new(1,0,0,16),Position=UDim2.new(0,0,0,42),Text="KILLS",Font=Enum.Font.GothamBold,TextSize=9,TextColor3=Color3.fromRGB(130,110,0),BackgroundTransparency=1,ZIndex=6,TextXAlignment=Enum.TextXAlignment.Center},KillDisp)

-- ── Score / win label ──
local ScoreLabel = newUI("TextLabel",{
	Size=UDim2.new(0,260,0,30),Position=UDim2.new(0.5,-130,0,12),
	Text="FIRST TO 15 KILLS WINS",Font=Enum.Font.GothamBold,TextSize=11,
	TextColor3=Color3.fromRGB(80,80,100),BackgroundTransparency=1,ZIndex=5,
	TextXAlignment=Enum.TextXAlignment.Center,LetterSpacing=2,
},BG)

-- ── Reload message ──
local ReloadMsg = newUI("TextLabel",{
	Size=UDim2.new(0,200,0,24),Position=UDim2.new(0.5,-100,0.5,40),
	Text="RELOADING...",Font=Enum.Font.GothamBold,TextSize=14,
	TextColor3=Color3.fromRGB(255,220,0),BackgroundTransparency=1,
	ZIndex=10,TextXAlignment=Enum.TextXAlignment.Center,TextTransparency=1,
},BG)

-- ── Kill feed ──
local KillFeedFrame = newUI("Frame",{Size=UDim2.new(0,300,0,200),Position=UDim2.new(1,-310,0,60),BackgroundTransparency=1,ZIndex=5},BG)
local KillFeedLayout = newUI("UIListLayout",{Padding=UDim.new(0,3),SortOrder=Enum.SortOrder.LayoutOrder,FillDirection=Enum.FillDirection.Vertical,HorizontalAlignment=Enum.HorizontalAlignment.Right,VerticalAlignment=Enum.VerticalAlignment.Top},KillFeedFrame)
local killFeedEntries={}
local killFeedOrder=0

local function addKillFeed(killer,victim)
	killFeedOrder+=1
	local msg=KILL_MSGS[math.random(#KILL_MSGS)]:gsub("{k}",victim):gsub("{v}",killer)
	local entry=newUI("Frame",{Size=UDim2.new(0,290,0,22),BackgroundColor3=Color3.fromRGB(0,0,0),BackgroundTransparency=0.4,BorderSizePixel=0,ZIndex=6,LayoutOrder=killFeedOrder},KillFeedFrame)
	corner(4,entry)
	local stripe=newUI("Frame",{Size=UDim2.new(0,3,1,0),BackgroundColor3=Color3.fromRGB(255,0,150),BorderSizePixel=0,ZIndex=7},entry)
	newUI("TextLabel",{Size=UDim2.new(1,-8,1,0),Position=UDim2.new(0,8,0,0),Text=msg,Font=Enum.Font.Gotham,TextSize=11,TextColor3=Color3.fromRGB(220,220,220),BackgroundTransparency=1,ZIndex=7,TextXAlignment=Enum.TextXAlignment.Left,TextTruncate=Enum.TextTruncate.AtEnd},entry)
	table.insert(killFeedEntries,entry)
	if #killFeedEntries>6 then
		local old=table.remove(killFeedEntries,1)
		old:Destroy()
	end
	-- Fade out after 5s
	task.delay(5,function()
		if entry and entry.Parent then
			TweenService:Create(entry,TweenInfo.new(0.5),{BackgroundTransparency=1}):Play()
			task.wait(0.5); if entry.Parent then entry:Destroy() end
		end
	end)
end

-- ── Gun viewmodel (colored rect in corner) ──
local GunModel = newUI("Frame",{
	Size=UDim2.new(0,80,0,28),Position=UDim2.new(1,-100,1,-60),
	BackgroundColor3=Color3.fromRGB(68,136,255),BorderSizePixel=0,ZIndex=8,
},BG)
corner(4,GunModel)

-- ── Weapon wheel indicator (bottom center) ──
local WepBar = newUI("Frame",{Size=UDim2.new(0,420,0,44),Position=UDim2.new(0.5,-210,1,-54),BackgroundColor3=Color3.fromRGB(0,0,0),BackgroundTransparency=0.5,BorderSizePixel=0,ZIndex=5},BG)
corner(10,WepBar)
local wepSlots={}
for i,w in ipairs(WEAPONS) do
	local slot=newUI("TextButton",{
		Size=UDim2.new(0,38,0,36),Position=UDim2.new(0,(i-1)*42+2,0,4),
		BackgroundColor3=i==1 and Color3.fromRGB(0,80,40) or Color3.fromRGB(10,10,20),
		BorderSizePixel=0,ZIndex=6,Text=w.emoji,Font=Enum.Font.GothamBold,TextSize=18,
	},WepBar)
	corner(6,slot)
	slot.MouseButton1Click:Connect(function() switchWeapon(i) end)
	wepSlots[i]=slot
end

-- ── Leaderboard overlay ──
local LBOverlay = newUI("Frame",{
	Size=UDim2.new(0,440,0,440),Position=UDim2.new(0.5,-220,0.5,-220),
	BackgroundColor3=Color3.fromRGB(4,4,16),BorderSizePixel=0,ZIndex=30,Visible=false,
},BG)
corner(14,LBOverlay)
local LBStroke=Instance.new("UIStroke"); LBStroke.Thickness=1; LBStroke.Color=Color3.fromRGB(40,60,140); LBStroke.Parent=LBOverlay
newUI("TextLabel",{Size=UDim2.new(1,0,0,32),Position=UDim2.new(0,0,0,4),Text="🏆  LEADERBOARD",Font=Enum.Font.GothamBold,TextSize=16,TextColor3=Color3.fromRGB(255,210,0),BackgroundTransparency=1,ZIndex=31,TextXAlignment=Enum.TextXAlignment.Center},LBOverlay)
local LBRows=newUI("Frame",{Size=UDim2.new(1,-20,1,-50),Position=UDim2.new(0,10,0,40),BackgroundTransparency=1,ZIndex=31},LBOverlay)
local LBLayout=newUI("UIListLayout",{Padding=UDim.new(0,3),SortOrder=Enum.SortOrder.LayoutOrder},LBRows)

local function refreshLB()
	for _,c in ipairs(LBRows:GetChildren()) do if not c:IsA("UIListLayout") then c:Destroy() end end
	if not GetLB then return end
	local ok,data=pcall(function() return GetLB:InvokeServer() end)
	if not ok or not data then return end
	for i,entry in ipairs(data) do
		local isYou=entry.name==player.Name
		local row=newUI("Frame",{Size=UDim2.new(1,0,0,28),BackgroundColor3=isYou and Color3.fromRGB(0,40,20) or Color3.fromRGB(8,8,22),BorderSizePixel=0,ZIndex=32,LayoutOrder=i},LBRows)
		corner(6,row)
		if isYou then local s=Instance.new("UIStroke"); s.Thickness=1; s.Color=Color3.fromRGB(0,200,80); s.Parent=row end
		local col3=i==1 and Color3.fromRGB(255,210,0) or i==2 and Color3.fromRGB(200,200,220) or i==3 and Color3.fromRGB(200,130,80) or Color3.fromRGB(140,150,180)
		newUI("TextLabel",{Size=UDim2.new(0,30,1,0),Text="#"..i,Font=Enum.Font.GothamBold,TextSize=11,TextColor3=col3,BackgroundTransparency=1,ZIndex=33,TextXAlignment=Enum.TextXAlignment.Center},row)
		newUI("TextLabel",{Size=UDim2.new(1,-110,1,0),Position=UDim2.new(0,30,0,0),Text=(entry.isBot and "🤖 " or "")..entry.name,Font=Enum.Font.GothamBold,TextSize=12,TextColor3=Color3.fromRGB(220,220,240),BackgroundTransparency=1,ZIndex=33,TextXAlignment=Enum.TextXAlignment.Left,TextTruncate=Enum.TextTruncate.AtEnd},row)
		newUI("TextLabel",{Size=UDim2.new(0,70,1,0),Position=UDim2.new(1,-70,0,0),Text=(entry.kills or 0).." kills",Font=Enum.Font.GothamBold,TextSize=11,TextColor3=col3,BackgroundTransparency=1,ZIndex=33,TextXAlignment=Enum.TextXAlignment.Right},row)
	end
end

-- ── Win/death overlay ──
local WinScreen=newUI("Frame",{Size=UDim2.new(1,0,1,0),BackgroundColor3=Color3.fromRGB(0,0,0),BackgroundTransparency=0.3,ZIndex=50,Visible=false},BG)
local WinLbl=newUI("TextLabel",{Size=UDim2.new(0,600,0,80),Position=UDim2.new(0.5,-300,0.5,-60),Text="W RIZZ 🏆",Font=Enum.Font.GothamBold,TextSize=60,TextColor3=Color3.fromRGB(255,210,0),BackgroundTransparency=1,ZIndex=51,TextXAlignment=Enum.TextXAlignment.Center},WinScreen)
local WinSub=newUI("TextLabel",{Size=UDim2.new(0,600,0,30),Position=UDim2.new(0.5,-300,0.5,30),Text="",Font=Enum.Font.Gotham,TextSize=16,TextColor3=Color3.fromRGB(180,180,180),BackgroundTransparency=1,ZIndex=51,TextXAlignment=Enum.TextXAlignment.Center},WinScreen)

-- ═══════════════════════════════════════════════
--  HUD UPDATE
-- ═══════════════════════════════════════════════
local function updateHUD()
	local wep=WEAPONS[currentWep]
	WepName.Text=wep.emoji.." "..wep.name
	AmmoCur.Text=wep.ammo==-1 and "∞" or tostring(weaponAmmo)
	AmmoRes.Text=wep.ammo==-1 and "MELEE" or "/ "..wep.maxAmmo
	GunModel.BackgroundColor3=wep.col
	for i,s in ipairs(wepSlots) do
		s.BackgroundColor3=i==currentWep and Color3.fromRGB(0,80,40) or Color3.fromRGB(10,10,20)
	end
end

local function updateHP(hp,maxHp)
	local pct=hp/maxHp
	local w=math.max(0,pct)
	TweenService:Create(HPFill,TweenInfo.new(0.15),{Size=UDim2.new(w,0,1,0)}):Play()
	HPFill.BackgroundColor3=pct>0.5 and Color3.fromRGB(50,220,80) or pct>0.25 and Color3.fromRGB(255,140,0) or Color3.fromRGB(255,40,40)
end

local function showHitmark(kill)
	HitMark.TextColor3=kill and Color3.fromRGB(255,220,0) or Color3.fromRGB(255,50,50)
	TweenService:Create(HitMark,TweenInfo.new(0.05),{TextTransparency=0}):Play()
	hitmarkTimer=kill and 0.3 or 0.15
end

-- ═══════════════════════════════════════════════
--  WEAPON SWITCH
-- ═══════════════════════════════════════════════
function switchWeapon(idx)
	if idx<1 or idx>#WEAPONS then return end
	currentWep=idx
	local wep=WEAPONS[idx]
	weaponAmmo=wep.ammo
	reloading=false; reloadTimer=0; weaponFR=0
	TweenService:Create(ReloadMsg,TweenInfo.new(0.1),{TextTransparency=1}):Play()
	-- zoom off when switching
	if zoomActive then
		zoomActive=false
		local cam=workspace.CurrentCamera
		if cam then cam.FieldOfView=70 end
	end
	updateHUD()
end

local function reloadWeapon()
	local wep=WEAPONS[currentWep]
	if wep.ammo==-1 or reloading then return end
	reloading=true; reloadTimer=wep.reload
	TweenService:Create(ReloadMsg,TweenInfo.new(0.1),{TextTransparency=0}):Play()
end

-- ═══════════════════════════════════════════════
--  CAMERA SETUP (First Person)
-- ═══════════════════════════════════════════════
local camera = workspace.CurrentCamera
camera.CameraType = Enum.CameraType.Scriptable
camera.FieldOfView = 70

local yaw   = 0
local pitch = 0

-- ═══════════════════════════════════════════════
--  SHOOTING
-- ═══════════════════════════════════════════════
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

local function doShot()
	local wep=WEAPONS[currentWep]
	if reloading then return end
	if wep.ammo~=-1 and weaponAmmo<=0 then reloadWeapon(); return end
	if weaponFR>0 then return end

	weaponFR=wep.fr
	if wep.ammo~=-1 then weaponAmmo-=1 end
	updateHUD()

	-- Gun kick animation
	TweenService:Create(GunModel,TweenInfo.new(0.06),{Position=UDim2.new(1,-110,1,-56)}):Play()
	task.delay(0.08,function() TweenService:Create(GunModel,TweenInfo.new(0.1),{Position=UDim2.new(1,-100,1,-60)}):Play() end)

	local char=player.Character
	if not char then return end
	rayParams.FilterDescendantsInstances={char}

	local pellets=wep.pellets or 1
	local hitAny=false

	for _=1,pellets do
		local sp=wep.spread
		local origin=camera.CFrame.Position
		local lookDir=camera.CFrame.LookVector
		local right=camera.CFrame.RightVector
		local up=camera.CFrame.UpVector
		local dir=(lookDir + right*(math.random()-0.5)*sp*2 + up*(math.random()-0.5)*sp*2).Unit

		if wep.type=="melee" then
			-- melee: short range sphere cast
			for _,model in ipairs(workspace:GetChildren()) do
				if model:FindFirstChild("IsBot") and model:FindFirstChild("HP") then
					local root=model:FindFirstChild("HumanoidRootPart")
					if root and (root.Position-origin).Magnitude<wep.range then
						local hpVal=model:FindFirstChild("HP")
						if DamageBot then
							DamageBot:FireServer(model, wep.dmg, wep.id)
							hitAny=true
						end
					end
				end
			end
			break
		end

		local result=workspace:Raycast(origin, dir*wep.range, rayParams)
		if result then
			local hitPart=result.Instance
			local model=hitPart:FindFirstAncestorOfClass("Model")
			if model and model:FindFirstChild("IsBot") then
				if DamageBot then
					DamageBot:FireServer(model, wep.dmg, wep.id)
					hitAny=true
				end
			end

			if wep.explosive then
				-- Explosive: damage all bots in radius
				for _,m in ipairs(workspace:GetChildren()) do
					if m:FindFirstChild("IsBot") then
						local root=m:FindFirstChild("HumanoidRootPart")
						if root then
							local dist=(root.Position-result.Position).Magnitude
							if dist<12 then
								local splashDmg=wep.dmg*(1-dist/12)
								if DamageBot then DamageBot:FireServer(m,splashDmg,wep.id) end
								hitAny=true
							end
						end
					end
				end
				-- Explosion visual
				local flash=newUI("Frame",{Size=UDim2.new(0,120,0,120),Position=UDim2.new(0.5,-60,0.5,-60),BackgroundColor3=Color3.fromRGB(255,100,0),BackgroundTransparency=0.2,ZIndex=20},BG)
				corner(60,flash)
				task.delay(0.1,function()
					TweenService:Create(flash,TweenInfo.new(0.3),{BackgroundTransparency=1,Size=UDim2.new(0,200,0,200),Position=UDim2.new(0.5,-100,0.5,-100)}):Play()
					task.wait(0.3); flash:Destroy()
				end)
			end
		end
	end

	if hitAny then showHitmark(false) end

	-- Muzzle flash
	local mf=newUI("Frame",{Size=UDim2.new(0,12,0,12),Position=UDim2.new(1,-95,1,-65),BackgroundColor3=Color3.fromRGB(255,240,150),BackgroundTransparency=0,ZIndex=9},BG)
	corner(6,mf); task.delay(0.05,function() mf:Destroy() end)
end

-- ═══════════════════════════════════════════════
--  INPUT
-- ═══════════════════════════════════════════════
UserInputService.InputBegan:Connect(function(input, gameP)
	if gameP then return end
	if input.UserInputType==Enum.UserInputType.MouseButton1 then
		mouseHeld=true
		doShot()
	end
	if input.UserInputType==Enum.UserInputType.MouseButton2 then
		local wep=WEAPONS[currentWep]
		if wep.zoom then
			zoomActive=not zoomActive
			TweenService:Create(camera,TweenInfo.new(0.15),{FieldOfView=zoomActive and 25 or 70}):Play()
		end
	end
	if input.KeyCode==Enum.KeyCode.R then reloadWeapon() end
	if input.KeyCode==Enum.KeyCode.Tab then
		LBOverlay.Visible=true; refreshLB()
	end
	-- 1-0 weapon select
	local numMap={[Enum.KeyCode.One]=1,[Enum.KeyCode.Two]=2,[Enum.KeyCode.Three]=3,[Enum.KeyCode.Four]=4,
		[Enum.KeyCode.Five]=5,[Enum.KeyCode.Six]=6,[Enum.KeyCode.Seven]=7,[Enum.KeyCode.Eight]=8,
		[Enum.KeyCode.Nine]=9,[Enum.KeyCode.Zero]=10}
	if numMap[input.KeyCode] then switchWeapon(numMap[input.KeyCode]) end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType==Enum.UserInputType.MouseButton1 then mouseHeld=false end
	if input.KeyCode==Enum.KeyCode.Tab then LBOverlay.Visible=false end
end)

-- ═══════════════════════════════════════════════
--  REMOTE EVENTS
-- ═══════════════════════════════════════════════
if KillFeed then
	KillFeed.OnClientEvent:Connect(function(killer,victim)
		addKillFeed(killer,victim)
		if killer==player.Name then
			-- Update kill display
			local ls=player:FindFirstChild("leaderstats")
			local k=ls and ls:FindFirstChild("Kills")
			if k then KillNum.Text=tostring(k.Value) end
			showHitmark(true)
		end
	end)
end

if GameWon then
	GameWon.OnClientEvent:Connect(function(winner)
		gameEnded=true
		WinScreen.Visible=true
		WinLbl.Text=winner==player.Name and "W RIZZ 🏆" or "L + RATIO 💀"
		WinLbl.TextColor3=winner==player.Name and Color3.fromRGB(255,210,0) or Color3.fromRGB(255,60,60)
		WinSub.Text=winner==player.Name and "you won bestie 🏆" or winner.." won. you are literally an NPC."
		refreshLB()
	end)
end

-- ═══════════════════════════════════════════════
--  SLIDE MECHANIC
-- ═══════════════════════════════════════════════
local sliding=false
local slideTimer=0
local slideCooldown=0

UserInputService.InputBegan:Connect(function(input,gameP)
	if gameP then return end
	if input.KeyCode==Enum.KeyCode.LeftControl then
		local char=player.Character
		if not char then return end
		local hum=char:FindFirstChild("Humanoid")
		local hrp=char:FindFirstChild("HumanoidRootPart")
		if not hum or not hrp or sliding or slideCooldown>0 then return end
		-- Check if moving
		local vel=hrp.AssemblyLinearVelocity
		if vel.Magnitude<2 then return end
		sliding=true; slideTimer=0.6; slideCooldown=1.5
		hum.WalkSpeed=4
		-- Boost forward
		local bv=Instance.new("BodyVelocity")
		bv.Velocity=hrp.CFrame.LookVector*22
		bv.MaxForce=Vector3.new(1e5,0,1e5)
		bv.Parent=hrp
		game:GetService("Debris"):AddItem(bv,0.5)
	end
end)

-- ═══════════════════════════════════════════════
--  MAIN RENDER LOOP
-- ═══════════════════════════════════════════════
local lastTime=tick()

RunService.RenderStepped:Connect(function()
	local now=tick()
	local dt=math.min(now-lastTime,0.05)
	lastTime=now

	local char=player.Character
	local hum=char and char:FindFirstChild("Humanoid")
	local hrp=char and char:FindFirstChild("HumanoidRootPart")

	if not hrp then return end

	-- HP display
	if hum then
		updateHP(hum.Health, hum.MaxHealth)
	end

	-- First person camera
	local mouseDelta=UserInputService:GetMouseDelta()
	yaw   -= mouseDelta.X * 0.003
	pitch -= mouseDelta.Y * 0.003
	pitch = math.clamp(pitch, -math.pi/2.1, math.pi/2.1)

	local camCF = CFrame.new(hrp.Position + Vector3.new(0,0.7,0))
		* CFrame.fromEulerAnglesYXZ(pitch, yaw, 0)
	camera.CFrame = camCF

	-- Make humanoid face camera yaw
	hrp.CFrame = CFrame.new(hrp.Position) * CFrame.fromEulerAnglesYXZ(0, yaw, 0)

	-- Lock mouse
	UserInputService.MouseBehavior = Enum.MouseBehavior.LockCenter

	-- Fire rate
	if weaponFR > 0 then weaponFR -= dt end

	-- Auto fire
	if mouseHeld and WEAPONS[currentWep].type=="auto" and not gameEnded then
		doShot()
	end

	-- Burst
	if burstQueue > 0 then
		burstTimer -= dt
		if burstTimer <= 0 then
			doShot(); burstQueue -= 1; burstTimer = 0.07
		end
	end

	-- Reload
	if reloading then
		reloadTimer -= dt
		if reloadTimer <= 0 then
			weaponAmmo = WEAPONS[currentWep].maxAmmo
			reloading = false
			TweenService:Create(ReloadMsg,TweenInfo.new(0.1),{TextTransparency=1}):Play()
			updateHUD()
		end
	end

	-- Hit marker fade
	if hitmarkTimer > 0 then
		hitmarkTimer -= dt
		if hitmarkTimer <= 0 then
			TweenService:Create(HitMark,TweenInfo.new(0.1),{TextTransparency=1}):Play()
		end
	end

	-- Slide timer
	if sliding then
		slideTimer -= dt
		if slideTimer <= 0 then
			sliding = false
			if hum then hum.WalkSpeed = 16 end
		end
	end
	if slideCooldown > 0 then slideCooldown -= dt end

	-- Update kills from leaderstats
	local ls = player:FindFirstChild("leaderstats")
	local k = ls and ls:FindFirstChild("Kills")
	if k then KillNum.Text = tostring(k.Value) end
end)

-- Init
updateHUD()
