-- TycoonClient: HUD showing banked cash + un-banked cash, and toast messages
-- (buys, robber raids, banking, rebirth/nuke).

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService      = game:GetService("TweenService")

local player = Players.LocalPlayer
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local Notify  = Remotes:WaitForChild("Notify")

local gui = Instance.new("ScreenGui")
gui.Name = "TycoonHUD"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function label(text, size, pos, color, font)
	local t = Instance.new("TextLabel")
	t.Size = size; t.Position = pos; t.BackgroundTransparency = 1
	t.Font = font or Enum.Font.GothamBold; t.TextScaled = true
	t.TextColor3 = color; t.TextStrokeTransparency = 0.35; t.TextXAlignment = Enum.TextXAlignment.Left
	t.Text = text; t.Parent = gui
	return t
end

local cashLbl = label("$0", UDim2.fromOffset(360, 46), UDim2.fromOffset(16, 14), Color3.fromRGB(90,240,150))
local uncLbl  = label("Un-banked: $0", UDim2.fromOffset(360, 26), UDim2.fromOffset(18, 60), Color3.fromRGB(255,210,90))
local hintLbl = label("Step on a green BUY pad to build. Collect your cash before OTHER PLAYERS step on your cash collector and steal it!",
	UDim2.fromOffset(680, 22), UDim2.fromOffset(18, 86), Color3.fromRGB(170,185,205), Enum.Font.Gotham)

-- toast
local toast = Instance.new("TextLabel")
toast.Size = UDim2.fromOffset(520, 44); toast.AnchorPoint = Vector2.new(0.5,0)
toast.Position = UDim2.new(0.5, 0, 0, -60); toast.BackgroundColor3 = Color3.fromRGB(18,26,40)
toast.BackgroundTransparency = 0.05; toast.Font = Enum.Font.GothamBold; toast.TextScaled = true
toast.TextColor3 = Color3.fromRGB(120,255,170); toast.Text = ""
local corner = Instance.new("UICorner", toast); corner.CornerRadius = UDim.new(0,12)
local stroke = Instance.new("UIStroke", toast); stroke.Color = Color3.fromRGB(90,240,150); stroke.Thickness = 2
toast.Parent = gui

local function showToast(text, color)
	toast.Text = text
	toast.TextColor3 = color or Color3.fromRGB(120,255,170)
	stroke.Color = color or Color3.fromRGB(90,240,150)
	TweenService:Create(toast, TweenInfo.new(0.3), {Position = UDim2.new(0.5,0,0,18)}):Play()
	task.delay(2.6, function()
		TweenService:Create(toast, TweenInfo.new(0.3), {Position = UDim2.new(0.5,0,0,-60)}):Play()
	end)
end

local function fmt(n)
	n = math.floor(n)
	local u = {"","K","M","B","T"}; local i = 1
	while n >= 1000 and i < #u do n = n/1000; i = i + 1 end
	return (i > 1 and string.format("%.2f", n) or tostring(n)) .. u[i]
end

-- watch leaderstats Cash + Uncollected
local function bind()
	local ls = player:WaitForChild("leaderstats")
	local cash = ls:WaitForChild("Cash")
	local unc  = player:WaitForChild("Uncollected")
	local function upC() cashLbl.Text = "$"..fmt(cash.Value) end
	local function upU() uncLbl.Text = "Un-banked: $"..fmt(unc.Value) end
	cash.Changed:Connect(upC); unc.Changed:Connect(upU); upC(); upU()
end
bind()

Notify.OnClientEvent:Connect(function(kind, text)
	local colors = {
		robbed = Color3.fromRGB(255,90,90), poor = Color3.fromRGB(255,150,90),
		banked = Color3.fromRGB(120,255,170), nuke = Color3.fromRGB(255,80,80),
		rebirth = Color3.fromRGB(200,140,255),
	}
	showToast(text, colors[kind])
end)
