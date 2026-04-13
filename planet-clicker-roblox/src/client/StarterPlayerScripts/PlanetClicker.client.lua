-- LocalScript: PlanetClicker
-- Full client-side game logic + GUI

local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local TweenService      = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui        = game:GetService("StarterGui")

-- Hide default Roblox UI so our buttons aren't covered
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.EmotesMenu, false)
end)

local player    = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Wait for server remotes & shared data
local Remotes  = ReplicatedStorage:WaitForChild("Remotes", 10)
local LoadData = Remotes:WaitForChild("LoadData", 10)
local SaveData = Remotes:WaitForChild("SaveData", 10)
local GetLB    = Remotes:WaitForChild("GetLB", 10)
local ItemData = require(ReplicatedStorage:WaitForChild("ItemData", 10))

local ITEMS      = ItemData.Items
local REBIRTHS   = ItemData.Rebirths
local SIZE_MILES = ItemData.SizeMilestones

-- ═══════════════════════════════════════════════════════════════════════
--  STATE
-- ═══════════════════════════════════════════════════════════════════════
local state = {
	coins=0, strength=0, rebirths=0, mult=1,
	heldItem=1, sizeMult=1.0, nextSizeIdx=1, timePlayed=0,
	autoOn=false,
}
local dataLoaded  = false
local autoTimer   = 0
local clickBounce = 0
local rainbowHue  = 0
local notifTimer  = 0
local syncInterval= 0
local SYNC_EVERY  = 30
local popupTimer  = 0

-- ═══════════════════════════════════════════════════════════════════════
--  UTILS
-- ═══════════════════════════════════════════════════════════════════════
local function fmtNum(n)
	if not n or n ~= n then return "0" end
	if n >= 1e21 then return string.format("%.2fsx", n/1e21)
	elseif n >= 1e18 then return string.format("%.2fqi", n/1e18)
	elseif n >= 1e15 then return string.format("%.2fq",  n/1e15)
	elseif n >= 1e12 then return string.format("%.2ft",  n/1e12)
	elseif n >= 1e9  then return string.format("%.2fb",  n/1e9)
	elseif n >= 1e6  then return string.format("%.2fm",  n/1e6)
	elseif n >= 1e3  then return string.format("%.2fk",  n/1e3)
	else return tostring(math.floor(n)) end
end

local function fmtMult(m)
	if m >= 1e9  then return string.format("%.1fbx", m/1e9)
	elseif m >= 1e6  then return string.format("%.1fmx", m/1e6)
	elseif m >= 1e3  then return string.format("%.1fkx", m/1e3)
	else return "x"..tostring(math.floor(m)) end
end

local function fmtTime(s)
	local h = math.floor(s/3600)
	local m = math.floor((s%3600)/60)
	local sec = math.floor(s%60)
	if h > 0 then return string.format("%dh %dm", h, m) end
	if m > 0 then return string.format("%dm %ds", m, sec) end
	return string.format("%ds", sec)
end

local function newUI(class, props, parent)
	local obj = Instance.new(class)
	for k,v in pairs(props) do obj[k] = v end
	if parent then obj.Parent = parent end
	return obj
end
local function corner(r, parent)
	local c = Instance.new("UICorner"); c.CornerRadius=UDim.new(0,r); c.Parent=parent
end
local function stroke(thick, col, parent)
	local s = Instance.new("UIStroke"); s.Thickness=thick; s.Color=col; s.Parent=parent
end

-- ═══════════════════════════════════════════════════════════════════════
--  ROOT GUI
-- ═══════════════════════════════════════════════════════════════════════
local Gui = newUI("ScreenGui", {
	Name="PlanetClickerGui", ResetOnSpawn=false,
	ZIndexBehavior=Enum.ZIndexBehavior.Sibling,
	IgnoreGuiInset=true,
}, playerGui)

local BG = newUI("Frame", {
	Size=UDim2.new(1,0,1,0),
	BackgroundColor3=Color3.fromRGB(3,3,18),
	BorderSizePixel=0,
}, Gui)

-- ═══════════════════════════════════════════════════════════════════════
--  TOP BAR  (full width, 50px tall)
-- ═══════════════════════════════════════════════════════════════════════
local TopBar = newUI("Frame", {
	Size=UDim2.new(1,0,0,50),
	BackgroundColor3=Color3.fromRGB(6,6,26),
	BorderSizePixel=0, ZIndex=5,
}, BG)
stroke(1, Color3.fromRGB(30,50,120), TopBar)

-- Back button (far left)
local BackBtn = newUI("TextButton", {
	Size=UDim2.new(0,80,0,36), Position=UDim2.new(0,6,0,7),
	Text="← MENU", Font=Enum.Font.GothamBold, TextSize=11,
	TextColor3=Color3.fromRGB(160,170,200),
	BackgroundColor3=Color3.fromRGB(10,10,30),
	BorderSizePixel=0, ZIndex=6,
}, TopBar)
corner(6, BackBtn)
stroke(1, Color3.fromRGB(40,50,100), BackBtn)

-- Stat boxes in top bar
local statValues = {}
local function statBox(lbl, id, col, xPos)
	local box = newUI("Frame", {
		Size=UDim2.new(0,108,0,38), Position=UDim2.new(0,xPos,0,6),
		BackgroundColor3=Color3.fromRGB(10,10,35), BorderSizePixel=0, ZIndex=5,
	}, TopBar)
	corner(6, box)
	stroke(1, Color3.fromRGB(30,50,120), box)
	newUI("TextLabel", {
		Size=UDim2.new(1,0,0,14), Position=UDim2.new(0,0,0,2),
		Text=lbl, TextColor3=Color3.fromRGB(80,100,160),
		Font=Enum.Font.GothamBold, TextSize=9, BackgroundTransparency=1,
		TextXAlignment=Enum.TextXAlignment.Center,
	}, box)
	local val = newUI("TextLabel", {
		Name=id, Size=UDim2.new(1,-4,0,20), Position=UDim2.new(0,2,0,16),
		Text="0", TextColor3=col, Font=Enum.Font.GothamBold, TextSize=14,
		BackgroundTransparency=1, TextXAlignment=Enum.TextXAlignment.Center,
		TextTruncate=Enum.TextTruncate.AtEnd,
	}, box)
	statValues[id] = val
	return val
end

statBox("COINS",     "coins",    Color3.fromRGB(255,220,50),  92)
statBox("MULT",      "mult",     Color3.fromRGB(255,100,200), 208)
statBox("STRENGTH",  "strength", Color3.fromRGB(100,255,120), 324)
statBox("REBIRTHS",  "rebirths", Color3.fromRGB(200,150,255), 440)
statBox("PER CLICK", "cpc",      Color3.fromRGB(100,200,255), 556)

-- ═══════════════════════════════════════════════════════════════════════
--  LAYOUT  (below top bar, two columns)
--    Left col  : planet + auto click button
--    Right col : shop + rebirth + LB buttons
-- ═══════════════════════════════════════════════════════════════════════
local CONTENT_Y    = 54    -- pixels below topbar
local RIGHT_W      = 250   -- right panel width
local RIGHT_MARGIN = 6

-- ── RIGHT PANEL ──────────────────────────────────────────────────────
local RightPanel = newUI("Frame", {
	Size=UDim2.new(0,RIGHT_W, 1,-(CONTENT_Y+4)),
	Position=UDim2.new(1,-(RIGHT_W+RIGHT_MARGIN), 0, CONTENT_Y+2),
	BackgroundColor3=Color3.fromRGB(6,6,24),
	BorderSizePixel=0, ZIndex=3,
}, BG)
corner(10, RightPanel)
stroke(1, Color3.fromRGB(25,40,110), RightPanel)

-- Panel title
newUI("TextLabel", {
	Size=UDim2.new(1,0,0,26), Position=UDim2.new(0,0,0,2),
	Text="🛒  SHOP", Font=Enum.Font.GothamBold, TextSize=13,
	TextColor3=Color3.fromRGB(100,140,255), BackgroundTransparency=1, ZIndex=4,
	TextXAlignment=Enum.TextXAlignment.Center,
}, RightPanel)

-- Scrollable shop list (takes most of panel height, leaving room for buttons)
local ShopScroll = newUI("ScrollingFrame", {
	Size=UDim2.new(1,-8, 1,-180),   -- leave 180px at bottom for buttons
	Position=UDim2.new(0,4, 0,30),
	BackgroundTransparency=1, BorderSizePixel=0,
	ScrollBarThickness=5, ZIndex=4,
	CanvasSize=UDim2.new(0,0,0,0),
	AutomaticCanvasSize=Enum.AutomaticSize.Y,
	ScrollingDirection=Enum.ScrollingDirection.Y,
}, RightPanel)
newUI("UIListLayout",{Padding=UDim.new(0,5), SortOrder=Enum.SortOrder.LayoutOrder}, ShopScroll)
newUI("UIPadding",{PaddingLeft=UDim.new(0,2),PaddingRight=UDim.new(0,2),PaddingTop=UDim.new(0,2)}, ShopScroll)

-- Divider
newUI("Frame",{
	Size=UDim2.new(1,-16,0,1), Position=UDim2.new(0,8, 1,-178),
	BackgroundColor3=Color3.fromRGB(30,50,120), BorderSizePixel=0, ZIndex=4,
}, RightPanel)

-- ── REBIRTH BUTTON ────────────────────────────────────────────────────
local RebirthBtn = newUI("TextButton", {
	Size=UDim2.new(1,-16,0,42), Position=UDim2.new(0,8, 1,-174),
	BackgroundColor3=Color3.fromRGB(40,8,80), BorderSizePixel=0,
	Text="🔄  REBIRTH", Font=Enum.Font.GothamBold, TextSize=15,
	TextColor3=Color3.fromRGB(220,160,255), ZIndex=5,
}, RightPanel)
corner(10, RebirthBtn)
stroke(2, Color3.fromRGB(120,40,200), RebirthBtn)

-- Rebirth info label
local RebirthInfo = newUI("TextLabel", {
	Size=UDim2.new(1,-16,0,28), Position=UDim2.new(0,8, 1,-130),
	Text="Next: Rebirth I · 100k coins · x3",
	Font=Enum.Font.Gotham, TextSize=10,
	TextColor3=Color3.fromRGB(160,120,200), BackgroundTransparency=1, ZIndex=5,
	TextXAlignment=Enum.TextXAlignment.Center, TextWrapped=true,
}, RightPanel)

-- ── AUTO-CLICKER BUTTON ───────────────────────────────────────────────
local AutoBtn = newUI("TextButton", {
	Size=UDim2.new(1,-16,0,36), Position=UDim2.new(0,8, 1,-100),
	BackgroundColor3=Color3.fromRGB(8,25,8), BorderSizePixel=0,
	Text="⚡  AUTO-CLICKER: OFF", Font=Enum.Font.GothamBold, TextSize=12,
	TextColor3=Color3.fromRGB(100,200,100), ZIndex=5,
}, RightPanel)
corner(8, AutoBtn)
stroke(2, Color3.fromRGB(30,80,30), AutoBtn)

-- ── LEADERBOARD BUTTON ────────────────────────────────────────────────
local LBBtn = newUI("TextButton", {
	Size=UDim2.new(1,-16,0,34), Position=UDim2.new(0,8, 1,-58),
	BackgroundColor3=Color3.fromRGB(10,20,40), BorderSizePixel=0,
	Text="🏆  LEADERBOARD (TOP 40)", Font=Enum.Font.GothamBold, TextSize=11,
	TextColor3=Color3.fromRGB(150,170,255), ZIndex=5,
}, RightPanel)
corner(8, LBBtn)
stroke(1, Color3.fromRGB(40,60,120), LBBtn)

-- ── BUILD SHOP ITEMS ──────────────────────────────────────────────────
local shopButtons = {}
for i, item in ipairs(ITEMS) do
	local btn = newUI("TextButton", {
		Name="Item_"..i, Size=UDim2.new(1,0,0,52),
		BackgroundColor3=Color3.fromRGB(10,12,35), BorderSizePixel=0,
		Text="", ZIndex=4, LayoutOrder=i,
	}, ShopScroll)
	corner(7, btn)

	-- Left color stripe
	local stripe = newUI("Frame",{Size=UDim2.new(0,4,1,0),BackgroundColor3=item.lightCol,BorderSizePixel=0},btn)
	corner(4,stripe)

	-- Mini viewport icon
	local mVPF = newUI("ViewportFrame",{
		Size=UDim2.new(0,40,0,40), Position=UDim2.new(0,8,0,6),
		BackgroundColor3=Color3.fromRGB(5,5,20), BorderSizePixel=0,
		LightColor=Color3.fromRGB(255,255,255),
		LightDirection=Vector3.new(-1,-1,-1),
	}, btn)
	corner(20, mVPF)
	local mCam = Instance.new("Camera")
	mCam.CFrame = CFrame.new(Vector3.new(0,0,8), Vector3.new(0,0,0))
	mCam.Parent = mVPF; mVPF.CurrentCamera = mCam
	local mPart = Instance.new("Part")
	mPart.Anchored=true; mPart.CFrame=CFrame.new(0,0,0)
	mPart.Shape=item.shape; mPart.Size=item.size*.5
	mPart.BrickColor=item.col; mPart.Material=item.mat
	mPart.CastShadow=false; mPart.Parent=mVPF
	local mLight = Instance.new("PointLight",mPart)
	mLight.Range=15; mLight.Brightness=item.lightBright; mLight.Color=item.lightCol

	newUI("TextLabel",{
		Size=UDim2.new(1,-58,0,18), Position=UDim2.new(0,56,0,4),
		Text=item.name, Font=Enum.Font.GothamBold, TextSize=12,
		TextColor3=Color3.fromRGB(200,210,255), BackgroundTransparency=1, ZIndex=5,
		TextXAlignment=Enum.TextXAlignment.Left,
	},btn)
	newUI("TextLabel",{
		Size=UDim2.new(1,-58,0,14), Position=UDim2.new(0,56,0,22),
		Text="+"..(fmtNum(item.cpc)).." / click", Font=Enum.Font.Gotham, TextSize=10,
		TextColor3=Color3.fromRGB(100,200,255), BackgroundTransparency=1, ZIndex=5,
		TextXAlignment=Enum.TextXAlignment.Left,
	},btn)
	local costLbl = newUI("TextLabel",{
		Name="CostLbl", Size=UDim2.new(1,-58,0,13), Position=UDim2.new(0,56,0,36),
		Text=item.cost==0 and "FREE" or "💰 "..fmtNum(item.cost),
		Font=Enum.Font.Gotham, TextSize=10,
		TextColor3=Color3.fromRGB(255,210,40), BackgroundTransparency=1, ZIndex=5,
		TextXAlignment=Enum.TextXAlignment.Left,
	},btn)
	if item.rbReq > 0 then
		newUI("TextLabel",{
			Size=UDim2.new(0,60,0,14), Position=UDim2.new(1,-62,0,2),
			Text="🔒 "..item.rbReq.."RB", Font=Enum.Font.GothamBold, TextSize=9,
			TextColor3=Color3.fromRGB(160,120,80), BackgroundTransparency=1, ZIndex=5,
			TextXAlignment=Enum.TextXAlignment.Right,
		},btn)
	end

	shopButtons[i] = {btn=btn, miniPart=mPart, miniVPF=mVPF, costLbl=costLbl}
	btn.MouseButton1Click:Connect(function() buyItem(i) end)
end

-- ═══════════════════════════════════════════════════════════════════════
--  CENTER: VIEWPORT FRAME (planet) + click button
-- ═══════════════════════════════════════════════════════════════════════
-- Center column sits to the left of RightPanel
local LEFT_W = UDim2.new(1,-(RIGHT_W+RIGHT_MARGIN+8), 1,-(CONTENT_Y+4))
local VPF_SIZE = 290

local VPF = newUI("ViewportFrame",{
	Size=UDim2.new(0,VPF_SIZE,0,VPF_SIZE),
	Position=UDim2.new(0.5,-(RIGHT_W//2+RIGHT_MARGIN)-(VPF_SIZE//2), 0, CONTENT_Y+14),
	BackgroundColor3=Color3.fromRGB(5,5,20), BorderSizePixel=0, ZIndex=2,
	LightColor=Color3.fromRGB(255,255,255),
	LightDirection=Vector3.new(-1,-1.5,-1),
	ImageColor3=Color3.fromRGB(5,5,20),
	Ambient=Color3.fromRGB(35,35,55),
},BG)
corner(145, VPF)
stroke(2, Color3.fromRGB(40,70,180), VPF)

local vpfCam = Instance.new("Camera")
vpfCam.CFrame = CFrame.new(Vector3.new(0,0,12), Vector3.new(0,0,0))
vpfCam.Parent = VPF; VPF.CurrentCamera = vpfCam

local planetPart = Instance.new("Part")
planetPart.Anchored=true; planetPart.CastShadow=false
planetPart.CFrame=CFrame.new(0,0,0)
planetPart.Shape=Enum.PartType.Ball
planetPart.Size=Vector3.new(5,5,5)
planetPart.BrickColor=BrickColor.new("Medium stone grey")
planetPart.Material=Enum.Material.SmoothPlastic
planetPart.Parent=VPF

local planetLight = Instance.new("PointLight", planetPart)
planetLight.Range=20; planetLight.Brightness=0.4

-- Transparent click button exactly over VPF
local ClickBtn = newUI("TextButton",{
	Size=UDim2.new(0,VPF_SIZE,0,VPF_SIZE),
	Position=UDim2.new(0.5,-(RIGHT_W//2+RIGHT_MARGIN)-(VPF_SIZE//2), 0, CONTENT_Y+14),
	BackgroundTransparency=1, Text="", ZIndex=10,
},BG)
corner(145, ClickBtn)

-- Planet name below VPF
local PlanetLabel = newUI("TextLabel",{
	Size=UDim2.new(0,VPF_SIZE,0,24),
	Position=UDim2.new(0.5,-(RIGHT_W//2+RIGHT_MARGIN)-(VPF_SIZE//2), 0, CONTENT_Y+14+VPF_SIZE+4),
	Text="MOON", Font=Enum.Font.GothamBold, TextSize=14,
	TextColor3=Color3.fromRGB(180,200,255), BackgroundTransparency=1, ZIndex=3,
	TextXAlignment=Enum.TextXAlignment.Center,
},BG)

-- Click popup label
local ClickPopup = newUI("TextLabel",{
	Size=UDim2.new(0,220,0,36),
	Position=UDim2.new(0.5,-(RIGHT_W//2+RIGHT_MARGIN)-110, 0, CONTENT_Y+10),
	Text="", Font=Enum.Font.GothamBold, TextSize=22,
	TextColor3=Color3.fromRGB(255,220,50), BackgroundTransparency=1, ZIndex=15,
	TextXAlignment=Enum.TextXAlignment.Center,
	TextStrokeTransparency=0.3, TextStrokeColor3=Color3.fromRGB(0,0,0),
},BG)

-- ═══════════════════════════════════════════════════════════════════════
--  NOTIFICATION BAR
-- ═══════════════════════════════════════════════════════════════════════
local NotifBar = newUI("Frame",{
	Size=UDim2.new(0,380,0,42),
	Position=UDim2.new(0.5,-190, 0, CONTENT_Y+4),
	BackgroundColor3=Color3.fromRGB(10,40,10),
	BorderSizePixel=0, ZIndex=20, Visible=false,
},BG)
corner(10, NotifBar)
stroke(2, Color3.fromRGB(50,200,50), NotifBar)
local NotifLbl = newUI("TextLabel",{
	Size=UDim2.new(1,0,1,0), Text="",
	Font=Enum.Font.GothamBold, TextSize=13,
	TextColor3=Color3.fromRGB(150,255,150), BackgroundTransparency=1, ZIndex=21,
	TextXAlignment=Enum.TextXAlignment.Center, TextWrapped=true,
},NotifBar)

local function showNotif(text)
	NotifLbl.Text=text; NotifBar.Visible=true; notifTimer=3.5
end

-- ═══════════════════════════════════════════════════════════════════════
--  LEADERBOARD OVERLAY
-- ═══════════════════════════════════════════════════════════════════════
local LBOverlay = newUI("Frame",{
	Size=UDim2.new(0,520,0,480),
	Position=UDim2.new(0.5,-260, 0.5,-240),
	BackgroundColor3=Color3.fromRGB(4,4,18),
	BorderSizePixel=0, ZIndex=30, Visible=false,
},BG)
corner(14, LBOverlay)
stroke(2, Color3.fromRGB(50,80,200), LBOverlay)

newUI("TextLabel",{
	Size=UDim2.new(1,0,0,34), Position=UDim2.new(0,0,0,4),
	Text="🏆  LEADERBOARD — TOP 40",
	Font=Enum.Font.GothamBold, TextSize=16,
	TextColor3=Color3.fromRGB(150,180,255), BackgroundTransparency=1, ZIndex=31,
	TextXAlignment=Enum.TextXAlignment.Center,
},LBOverlay)

local LBClose = newUI("TextButton",{
	Size=UDim2.new(0,36,0,26), Position=UDim2.new(1,-42,0,6),
	Text="✕", Font=Enum.Font.GothamBold, TextSize=13,
	TextColor3=Color3.fromRGB(255,100,100),
	BackgroundColor3=Color3.fromRGB(40,10,10),
	ZIndex=32, BorderSizePixel=0,
},LBOverlay)
corner(6, LBClose)

local function makeLBCol(title, xPos, w)
	local col = newUI("Frame",{
		Size=UDim2.new(0,w,1,-60), Position=UDim2.new(0,xPos,0,44),
		BackgroundColor3=Color3.fromRGB(8,8,28), BorderSizePixel=0, ZIndex=31,
	},LBOverlay)
	corner(8, col)
	stroke(1, Color3.fromRGB(30,50,120), col)
	newUI("TextLabel",{
		Size=UDim2.new(1,0,0,20), Position=UDim2.new(0,0,0,2),
		Text=title, Font=Enum.Font.GothamBold, TextSize=10,
		TextColor3=Color3.fromRGB(100,130,200), BackgroundTransparency=1, ZIndex=32,
		TextXAlignment=Enum.TextXAlignment.Center,
	},col)
	local scroll = newUI("ScrollingFrame",{
		Size=UDim2.new(1,-4,1,-24), Position=UDim2.new(0,2,0,22),
		BackgroundTransparency=1, BorderSizePixel=0,
		ScrollBarThickness=3, ZIndex=32,
		CanvasSize=UDim2.new(0,0,0,0), AutomaticCanvasSize=Enum.AutomaticSize.Y,
	},col)
	newUI("UIListLayout",{Padding=UDim.new(0,2)},scroll)
	return scroll
end
local LBStrScroll  = makeLBCol("⚡ TOP STRENGTH",   8,   248)
local LBTimeScroll = makeLBCol("⏱ TOP TIME PLAYED", 264, 248)

local function populateLB(scroll, rows, valFmt)
	for _,c in ipairs(scroll:GetChildren()) do
		if not c:IsA("UIListLayout") then c:Destroy() end
	end
	for i, row in ipairs(rows) do
		local col3 = i==1 and Color3.fromRGB(255,210,0)
		         or  i==2 and Color3.fromRGB(180,180,220)
		         or  i==3 and Color3.fromRGB(200,130,80)
		         or           Color3.fromRGB(140,150,180)
		local r = newUI("Frame",{
			Size=UDim2.new(1,-2,0,20),
			BackgroundColor3=Color3.fromRGB(10,12,35), BorderSizePixel=0, ZIndex=33,
		},scroll)
		corner(4,r)
		newUI("TextLabel",{Size=UDim2.new(0,22,1,0),Text="#"..i,
			Font=Enum.Font.GothamBold,TextSize=9,TextColor3=col3,
			BackgroundTransparency=1,ZIndex=34,TextXAlignment=Enum.TextXAlignment.Center},r)
		newUI("TextLabel",{Size=UDim2.new(1,-80,1,0),Position=UDim2.new(0,22,0,0),
			Text=row.name or "???",Font=Enum.Font.Gotham,TextSize=10,
			TextColor3=Color3.fromRGB(200,210,240),BackgroundTransparency=1,ZIndex=34,
			TextXAlignment=Enum.TextXAlignment.Left,TextTruncate=Enum.TextTruncate.AtEnd},r)
		newUI("TextLabel",{Size=UDim2.new(0,68,1,0),Position=UDim2.new(1,-70,0,0),
			Text=valFmt(row.value),Font=Enum.Font.GothamBold,TextSize=9,
			TextColor3=col3,BackgroundTransparency=1,ZIndex=34,
			TextXAlignment=Enum.TextXAlignment.Right},r)
	end
end

-- ═══════════════════════════════════════════════════════════════════════
--  PLANET EFFECTS
-- ═══════════════════════════════════════════════════════════════════════
local fireEffect, smokeEffect, sparkleEffect, smileGui = nil,nil,nil,nil

local function clearEffects()
	if fireEffect    then fireEffect:Destroy();    fireEffect    = nil end
	if smokeEffect   then smokeEffect:Destroy();   smokeEffect   = nil end
	if sparkleEffect then sparkleEffect:Destroy(); sparkleEffect = nil end
	if smileGui      then smileGui:Destroy();      smileGui      = nil end
end

local function applyPlanet(idx)
	local cfg = ITEMS[idx]; if not cfg then return end
	clearEffects()
	local sz = cfg.size * state.sizeMult
	planetPart.Shape    = cfg.shape
	planetPart.Size     = sz
	planetPart.BrickColor = cfg.col
	planetPart.Material   = cfg.mat
	planetLight.Color     = cfg.lightCol
	planetLight.Brightness= cfg.lightBright
	vpfCam.CFrame = CFrame.new(Vector3.new(0,0, math.max(9, sz.X*2)), Vector3.new(0,0,0))

	local sp = cfg.special
	if sp=="fire" then
		local f=Instance.new("Fire",planetPart)
		f.Size=3;f.Heat=6;f.Color=Color3.fromRGB(255,80,0);f.SecondaryColor=Color3.fromRGB(255,200,0)
		fireEffect=f
	elseif sp=="smoke" then
		local s=Instance.new("Smoke",planetPart)
		s.Opacity=0.08;s.RiseVelocity=1;s.Size=3;s.Color=Color3.fromRGB(180,130,80)
		smokeEffect=s
	elseif sp=="sparkles" then
		local s=Instance.new("Sparkles",planetPart)
		s.SparkleColor=Color3.fromRGB(255,240,150);sparkleEffect=s
	elseif sp=="sparkles_blue" then
		local s=Instance.new("Sparkles",planetPart)
		s.SparkleColor=Color3.fromRGB(100,180,255);sparkleEffect=s
	elseif sp=="sparkles_purple" then
		local s=Instance.new("Sparkles",planetPart)
		s.SparkleColor=Color3.fromRGB(180,80,255);sparkleEffect=s
	elseif sp=="rainbow" then
		local s=Instance.new("Sparkles",planetPart)
		s.SparkleColor=Color3.fromRGB(255,0,255);sparkleEffect=s
	elseif sp=="smiley" then
		local bg=Instance.new("BillboardGui",planetPart)
		bg.Size=UDim2.new(0,80,0,80);bg.StudsOffset=Vector3.new(0,0,2.8);bg.AlwaysOnTop=true
		local lbl=Instance.new("TextLabel",bg)
		lbl.Size=UDim2.new(1,0,1,0);lbl.Text=":)";lbl.TextScaled=true
		lbl.Font=Enum.Font.GothamBold;lbl.TextColor3=Color3.fromRGB(20,20,40)
		lbl.BackgroundTransparency=1
		smileGui=bg
	end
	PlanetLabel.Text = cfg.name:upper()
end

-- ═══════════════════════════════════════════════════════════════════════
--  GAME LOGIC
-- ═══════════════════════════════════════════════════════════════════════
local function getCPC() return ITEMS[state.heldItem].cpc * state.mult end

local function checkSizeMilestones()
	while state.nextSizeIdx <= #SIZE_MILES and state.strength >= SIZE_MILES[state.nextSizeIdx].str do
		state.sizeMult = SIZE_MILES[state.nextSizeIdx].factor
		showNotif("🪐 Size upgrade! Planet is now "..string.format("%.2f", state.sizeMult).."× bigger!")
		state.nextSizeIdx += 1
		applyPlanet(state.heldItem)
	end
end

local function syncToServer()
	SaveData:FireServer({
		coins=state.coins, strength=state.strength, rebirths=state.rebirths,
		mult=state.mult, heldItem=state.heldItem, sizeMult=state.sizeMult,
		nextSizeIdx=state.nextSizeIdx, timePlayed=state.timePlayed,
	})
end

local function doClick()
	if not dataLoaded then return end
	local earned = getCPC()
	state.coins    += earned
	state.strength += earned
	checkSizeMilestones()
	clickBounce = 1
	ClickPopup.Text = "+"..fmtNum(earned)
	popupTimer = 1.2
end

function buyItem(idx)
	if not dataLoaded then return end
	local item = ITEMS[idx]
	if state.rebirths < item.rbReq then
		showNotif("🔒 Need "..item.rbReq.." rebirths for "..item.name.."!"); return
	end
	if state.coins < item.cost then
		showNotif("💰 Not enough coins for "..item.name.."!"); return
	end
	state.coins   -= item.cost
	state.heldItem = idx
	applyPlanet(idx)
	showNotif("✅ Now holding "..item.name.."!")
end

local function doRebirth()
	if not dataLoaded then return end
	if state.rebirths >= #REBIRTHS then showNotif("🌟 Max rebirths reached!"); return end
	local rb = REBIRTHS[state.rebirths + 1]
	if state.coins < rb.cost then
		showNotif("Need "..fmtNum(rb.cost).." coins to rebirth!"); return
	end
	state.rebirths += 1
	state.mult      = rb.mult
	state.coins     = 0
	state.heldItem  = 1
	applyPlanet(1)
	showNotif("🌟 "..rb.name.."! Multiplier → "..fmtMult(rb.mult))
	syncToServer()
end

-- ═══════════════════════════════════════════════════════════════════════
--  UI UPDATE
-- ═══════════════════════════════════════════════════════════════════════
local function updateUI()
	statValues.coins.Text    = fmtNum(state.coins)
	statValues.mult.Text     = fmtMult(state.mult)
	statValues.strength.Text = fmtNum(state.strength)
	statValues.rebirths.Text = tostring(state.rebirths)
	statValues.cpc.Text      = fmtNum(getCPC())

	if state.rebirths < #REBIRTHS then
		local rb = REBIRTHS[state.rebirths+1]
		RebirthInfo.Text = rb.name.." · "..fmtNum(rb.cost).." · "..fmtMult(rb.mult)
		RebirthBtn.BackgroundColor3 = state.coins >= rb.cost
			and Color3.fromRGB(60,10,110) or Color3.fromRGB(25,6,50)
	else
		RebirthInfo.Text = "⭐ MAX REBIRTHS ACHIEVED!"
		RebirthBtn.BackgroundColor3 = Color3.fromRGB(15,6,30)
	end

	for i, sd in ipairs(shopButtons) do
		local item   = ITEMS[i]
		local locked = state.rebirths < item.rbReq
		local held   = i == state.heldItem
		local afford = not locked and state.coins >= item.cost
		if held then
			sd.btn.BackgroundColor3=Color3.fromRGB(8,35,8)
			stroke(2,Color3.fromRGB(50,200,50),sd.btn)
		elseif locked then
			sd.btn.BackgroundColor3=Color3.fromRGB(8,8,18)
			sd.btn.BackgroundTransparency=0.4
		elseif afford then
			sd.btn.BackgroundColor3=Color3.fromRGB(14,18,50)
			stroke(1,Color3.fromRGB(60,90,200),sd.btn)
		else
			sd.btn.BackgroundColor3=Color3.fromRGB(10,10,28)
			stroke(1,Color3.fromRGB(22,30,70),sd.btn)
		end
	end
end

-- ═══════════════════════════════════════════════════════════════════════
--  BUTTON CONNECTIONS
-- ═══════════════════════════════════════════════════════════════════════
ClickBtn.MouseButton1Click:Connect(doClick)
RebirthBtn.MouseButton1Click:Connect(doRebirth)
LBClose.MouseButton1Click:Connect(function() LBOverlay.Visible=false end)

AutoBtn.MouseButton1Click:Connect(function()
	state.autoOn = not state.autoOn
	AutoBtn.Text = state.autoOn and "⚡  AUTO-CLICKER: ON" or "⚡  AUTO-CLICKER: OFF"
	AutoBtn.BackgroundColor3 = state.autoOn
		and Color3.fromRGB(8,40,8) or Color3.fromRGB(8,25,8)
	stroke(2, state.autoOn and Color3.fromRGB(50,200,50) or Color3.fromRGB(30,80,30), AutoBtn)
end)

LBBtn.MouseButton1Click:Connect(function()
	LBOverlay.Visible=true
	task.spawn(function()
		local ok1,sr = pcall(function() return GetLB:InvokeServer("strength") end)
		local ok2,tr = pcall(function() return GetLB:InvokeServer("time")     end)
		if ok1 and sr then populateLB(LBStrScroll,  sr, fmtNum)  end
		if ok2 and tr then populateLB(LBTimeScroll, tr, fmtTime) end
	end)
end)

BackBtn.MouseButton1Click:Connect(function() syncToServer() end)

-- ═══════════════════════════════════════════════════════════════════════
--  DATA FROM SERVER
-- ═══════════════════════════════════════════════════════════════════════
LoadData.OnClientEvent:Connect(function(data)
	state.coins       = data.coins       or 0
	state.strength    = data.strength    or 0
	state.rebirths    = data.rebirths    or 0
	state.mult        = data.mult        or 1
	state.heldItem    = math.clamp(data.heldItem or 1, 1, #ITEMS)
	state.sizeMult    = data.sizeMult    or 1.0
	state.nextSizeIdx = data.nextSizeIdx or 1
	state.timePlayed  = data.timePlayed  or 0
	dataLoaded = true
	applyPlanet(state.heldItem)
	updateUI()
end)

-- Offline fallback (Studio with no server)
task.delay(3, function()
	if not dataLoaded then
		dataLoaded=true; applyPlanet(state.heldItem); updateUI()
	end
end)

-- ═══════════════════════════════════════════════════════════════════════
--  MAIN LOOP
-- ═══════════════════════════════════════════════════════════════════════
local lastT = tick()
RunService.RenderStepped:Connect(function()
	local now = tick()
	local dt  = math.min(now - lastT, 0.05)
	lastT = now

	state.timePlayed += dt

	-- Auto-clicker: 5 clicks per second
	if state.autoOn and dataLoaded then
		autoTimer += dt
		while autoTimer >= 0.2 do
			autoTimer -= 0.2
			local e = getCPC()
			state.coins    += e
			state.strength += e
			checkSizeMilestones()
		end
	end

	-- Rotate planet
	planetPart.CFrame = planetPart.CFrame * CFrame.Angles(0, math.rad(dt*40), 0)

	-- Click bounce
	if clickBounce > 0 then
		clickBounce = math.max(0, clickBounce - dt*5)
		local s = 1 + clickBounce*0.12
		planetPart.Size = ITEMS[state.heldItem].size * state.sizeMult * s
	end

	-- Rainbow cube
	if state.heldItem == 11 then
		rainbowHue = (rainbowHue + dt*120) % 360
		planetPart.Color = Color3.fromHSV(rainbowHue/360, 1, 1)
		planetLight.Color = Color3.fromHSV(rainbowHue/360, 0.8, 1)
		planetPart.CFrame = planetPart.CFrame * CFrame.Angles(math.rad(dt*60), 0, math.rad(dt*30))
	end

	-- Rotate mini icons in shop
	for _, sd in ipairs(shopButtons) do
		sd.miniPart.CFrame = sd.miniPart.CFrame * CFrame.Angles(0, math.rad(dt*50), 0)
	end

	-- Click popup animation
	if popupTimer > 0 then
		popupTimer -= dt
		ClickPopup.TextTransparency = math.max(0, 1 - popupTimer*2)
		ClickPopup.Position = UDim2.new(
			0.5, -(RIGHT_W//2+RIGHT_MARGIN)-110,
			0,   CONTENT_Y + 10 - (1.2-popupTimer)*30
		)
		if popupTimer <= 0 then
			ClickPopup.Text=""; ClickPopup.TextTransparency=0
		end
	end

	-- Notification fade
	if notifTimer > 0 then
		notifTimer -= dt
		if notifTimer <= 0 then NotifBar.Visible=false end
	end

	-- Periodic server sync
	syncInterval += dt
	if syncInterval >= SYNC_EVERY then
		syncInterval=0; syncToServer()
	end

	updateUI()
end)
