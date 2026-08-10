-- Boss Tycoon — Client.client.lua
-- The ONLY LocalScript. Lives in StarterPlayer.StarterPlayerScripts as "TycoonClient".
-- Builds every bit of GUI in code: money display, toasts, duck jumpscare,
-- TV code prompt, nuke alert, win screen, lab fog.
-- Plain Lua 5.1 syntax only.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local SoundService = game:GetService("SoundService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local RNotify = Remotes:WaitForChild("Notify")
local RJumpscare = Remotes:WaitForChild("Jumpscare")
local RTVPrompt = Remotes:WaitForChild("TVPrompt")
local RTVSubmit = Remotes:WaitForChild("TVSubmit")
local RNukeAlert = Remotes:WaitForChild("NukeAlert")
local RWinGame = Remotes:WaitForChild("WinGame")
local RLabFog = Remotes:WaitForChild("LabFog")

--------------------------------------------------------------------------
-- Small helpers
--------------------------------------------------------------------------

local COLORS = {
	green = Color3.fromRGB(60, 200, 90),
	red = Color3.fromRGB(230, 70, 70),
	yellow = Color3.fromRGB(250, 210, 60),
	white = Color3.fromRGB(245, 245, 245),
}

local function mk(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local function corner(parent, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius or 10)
	c.Parent = parent
	return c
end

local function stroke(parent, color, thickness, transparency)
	local s = Instance.new("UIStroke")
	s.Color = color or Color3.fromRGB(255, 255, 255)
	s.Thickness = thickness or 2
	s.Transparency = transparency or 0
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

local function tween(inst, info, goal)
	local t = TweenService:Create(inst, info, goal)
	t:Play()
	return t
end

local function playSound(assetId, volume, pitch)
	pcall(function()
		local s = Instance.new("Sound")
		s.SoundId = assetId
		s.Volume = volume or 0.7
		if pitch then
			s.PlaybackSpeed = pitch
		end
		s.Parent = SoundService
		s:Play()
		s.Ended:Connect(function()
			s:Destroy()
		end)
		game:GetService("Debris"):AddItem(s, 8)
	end)
end

--------------------------------------------------------------------------
-- Root ScreenGui
--------------------------------------------------------------------------

local gui = mk("ScreenGui", {
	Name = "TycoonGui",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 10,
}, playerGui)

--------------------------------------------------------------------------
-- 1) MONEY DISPLAY (top center)
--------------------------------------------------------------------------

local moneyFrame = mk("Frame", {
	Name = "MoneyFrame",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 14),
	Size = UDim2.new(0, 240, 0, 52),
	BackgroundColor3 = Color3.fromRGB(24, 30, 24),
	BackgroundTransparency = 0.12,
	BorderSizePixel = 0,
}, gui)
corner(moneyFrame, 14)
stroke(moneyFrame, Color3.fromRGB(90, 230, 120), 2.5, 0.1)

local moneyScale = mk("UIScale", { Scale = 1 }, moneyFrame)

local coin = mk("TextLabel", {
	Name = "Coin",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 8, 0.5, 0),
	Size = UDim2.new(0, 36, 0, 36),
	BackgroundColor3 = Color3.fromRGB(255, 205, 60),
	Text = "$",
	TextColor3 = Color3.fromRGB(120, 80, 10),
	Font = Enum.Font.GothamBold,
	TextSize = 24,
	BorderSizePixel = 0,
}, moneyFrame)
corner(coin, 18)
stroke(coin, Color3.fromRGB(255, 240, 170), 2, 0.2)

local moneyText = mk("TextLabel", {
	Name = "MoneyText",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 52, 0.5, 0),
	Size = UDim2.new(1, -60, 1, -10),
	BackgroundTransparency = 1,
	Text = "$0",
	TextColor3 = Color3.fromRGB(140, 255, 160),
	Font = Enum.Font.GothamBold,
	TextSize = 26,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextScaled = false,
}, moneyFrame)
stroke(moneyText, Color3.fromRGB(0, 60, 20), 1.5, 0.4)

local function popMoney()
	moneyScale.Scale = 1.18
	tween(moneyScale, TweenInfo.new(0.28, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 })
end

task.spawn(function()
	local stats = player:WaitForChild("leaderstats")
	local money = stats:WaitForChild("Money")
	local function refresh()
		moneyText.Text = tostring(money.Value)
		popMoney()
	end
	money.Changed:Connect(refresh)
	moneyText.Text = tostring(money.Value)
end)

--------------------------------------------------------------------------
-- 2) NOTIFY — toast stack, bottom right
--------------------------------------------------------------------------

local toastHolder = mk("Frame", {
	Name = "ToastHolder",
	AnchorPoint = Vector2.new(1, 1),
	Position = UDim2.new(1, -14, 1, -14),
	Size = UDim2.new(0, 300, 0, 400),
	BackgroundTransparency = 1,
}, gui)

mk("UIListLayout", {
	FillDirection = Enum.FillDirection.Vertical,
	HorizontalAlignment = Enum.HorizontalAlignment.Right,
	VerticalAlignment = Enum.VerticalAlignment.Bottom,
	SortOrder = Enum.SortOrder.LayoutOrder,
	Padding = UDim.new(0, 8),
}, toastHolder)

local toastOrder = 0

local function showToast(text, colorName)
	local col = COLORS[colorName] or COLORS.white
	toastOrder = toastOrder + 1

	-- outer slot (list-layout controlled), inner frame slides in from the right
	local slot = mk("Frame", {
		Name = "ToastSlot",
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundTransparency = 1,
		LayoutOrder = toastOrder,
		ClipsDescendants = true,
	}, toastHolder)

	local toast = mk("Frame", {
		Name = "Toast",
		Position = UDim2.new(1, 10, 0, 0),
		Size = UDim2.new(1, 0, 1, 0),
		BackgroundColor3 = Color3.fromRGB(22, 22, 28),
		BackgroundTransparency = 0.08,
		BorderSizePixel = 0,
	}, slot)
	corner(toast, 10)
	stroke(toast, col, 2, 0.1)

	local bar = mk("Frame", {
		Name = "Bar",
		Position = UDim2.new(0, 6, 0, 6),
		Size = UDim2.new(0, 5, 1, -12),
		BackgroundColor3 = col,
		BorderSizePixel = 0,
	}, toast)
	corner(bar, 3)

	local lbl = mk("TextLabel", {
		Name = "Text",
		Position = UDim2.new(0, 20, 0, 0),
		Size = UDim2.new(1, -28, 1, 0),
		BackgroundTransparency = 1,
		Text = text,
		TextColor3 = col,
		Font = Enum.Font.GothamBold,
		TextSize = 17,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, toast)

	-- slide in
	tween(toast, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
		Position = UDim2.new(0, 0, 0, 0),
	})

	task.delay(3, function()
		tween(toast, TweenInfo.new(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			Position = UDim2.new(1, 10, 0, 0),
			BackgroundTransparency = 1,
		})
		tween(lbl, TweenInfo.new(0.45), { TextTransparency = 1 })
		tween(bar, TweenInfo.new(0.45), { BackgroundTransparency = 1 })
		task.delay(0.5, function()
			slot:Destroy()
		end)
	end)
end

RNotify.OnClientEvent:Connect(function(text, colorName)
	showToast(tostring(text), colorName)
end)

--------------------------------------------------------------------------
-- 3) JUMPSCARE — the friendly duck. Sunny flash + giant goofy duck face.
--------------------------------------------------------------------------

local duckBusy = false

local function doDuck()
	if duckBusy then
		return
	end
	duckBusy = true

	local overlay = mk("Frame", {
		Name = "DuckOverlay",
		Size = UDim2.new(1, 0, 1, 0),
		BackgroundColor3 = Color3.fromRGB(255, 225, 70),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ZIndex = 50,
	}, gui)

	-- sunny flash in
	tween(overlay, TweenInfo.new(0.12), { BackgroundTransparency = 0 })

	-- face container (everything wobbles together)
	local face = mk("Frame", {
		Name = "DuckFace",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, -20),
		Size = UDim2.new(0, 420, 0, 420),
		BackgroundColor3 = Color3.fromRGB(255, 240, 120),
		BorderSizePixel = 0,
		ZIndex = 51,
		Rotation = -6,
	}, overlay)
	corner(face, 210)
	stroke(face, Color3.fromRGB(235, 180, 30), 6, 0)

	local faceScale = mk("UIScale", { Scale = 0.1 }, face)

	-- eyes: big white circles with black pupils + tiny shine
	local function makeEye(xScale)
		local eye = mk("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(xScale, 0, 0.32, 0),
			Size = UDim2.new(0, 120, 0, 120),
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			BorderSizePixel = 0,
			ZIndex = 52,
		}, face)
		corner(eye, 60)
		stroke(eye, Color3.fromRGB(40, 40, 40), 4, 0)
		local pupil = mk("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.5, 0, 0.6, 0),
			Size = UDim2.new(0, 52, 0, 52),
			BackgroundColor3 = Color3.fromRGB(20, 20, 20),
			BorderSizePixel = 0,
			ZIndex = 53,
		}, eye)
		corner(pupil, 26)
		mk("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.68, 0, 0.32, 0),
			Size = UDim2.new(0, 16, 0, 16),
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			BorderSizePixel = 0,
			ZIndex = 54,
		}, pupil)
		return eye
	end
	makeEye(0.28)
	makeEye(0.72)

	-- rosy cheeks
	local function makeCheek(xScale)
		local cheek = mk("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(xScale, 0, 0.55, 0),
			Size = UDim2.new(0, 56, 0, 34),
			BackgroundColor3 = Color3.fromRGB(255, 160, 150),
			BackgroundTransparency = 0.25,
			BorderSizePixel = 0,
			ZIndex = 52,
		}, face)
		corner(cheek, 17)
		return cheek
	end
	makeCheek(0.14)
	makeCheek(0.86)

	-- big orange duck bill (two stacked rounded frames = goofy smile bill)
	local billTop = mk("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.62, 0),
		Size = UDim2.new(0, 190, 0, 70),
		BackgroundColor3 = Color3.fromRGB(255, 150, 40),
		BorderSizePixel = 0,
		ZIndex = 53,
	}, face)
	corner(billTop, 35)
	stroke(billTop, Color3.fromRGB(200, 110, 20), 4, 0)

	local billBottom = mk("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.73, 0),
		Size = UDim2.new(0, 140, 0, 46),
		BackgroundColor3 = Color3.fromRGB(240, 130, 30),
		BorderSizePixel = 0,
		ZIndex = 52,
	}, face)
	corner(billBottom, 23)

	-- nostrils
	mk("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.42, 0, 0.35, 0),
		Size = UDim2.new(0, 10, 0, 10),
		BackgroundColor3 = Color3.fromRGB(170, 90, 15),
		BorderSizePixel = 0,
		ZIndex = 54,
	}, billTop)
	mk("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.58, 0, 0.35, 0),
		Size = UDim2.new(0, 10, 0, 10),
		BackgroundColor3 = Color3.fromRGB(170, 90, 15),
		BorderSizePixel = 0,
		ZIndex = 54,
	}, billTop)

	-- QUACK :) text under the face
	local quack = mk("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.5, 210),
		Size = UDim2.new(0, 600, 0, 90),
		BackgroundTransparency = 1,
		Text = "QUACK :)",
		TextColor3 = Color3.fromRGB(255, 255, 255),
		Font = Enum.Font.GothamBold,
		TextSize = 72,
		ZIndex = 52,
		Rotation = 3,
	}, overlay)
	stroke(quack, Color3.fromRGB(235, 150, 20), 5, 0)

	-- silly honk (free pop/honk SFX, wrapped in pcall inside playSound)
	playSound("rbxassetid://12222124", 1, 0.85)
	task.delay(0.35, function()
		playSound("rbxassetid://12222124", 1, 1.2)
	end)

	-- boing in
	tween(faceScale, TweenInfo.new(0.35, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out), { Scale = 1 })

	-- wobble loop
	task.spawn(function()
		local dir = 1
		for i = 1, 6 do
			if not face.Parent then
				return
			end
			local tw = tween(face, TweenInfo.new(0.3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), {
				Rotation = 8 * dir,
			})
			dir = -dir
			tw.Completed:Wait()
		end
	end)

	-- gone after 2.5s
	task.delay(2.5, function()
		tween(faceScale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.In), { Scale = 0.05 })
		tween(overlay, TweenInfo.new(0.35), { BackgroundTransparency = 1 })
		tween(quack, TweenInfo.new(0.25), { TextTransparency = 1 })
		task.delay(0.4, function()
			overlay:Destroy()
			duckBusy = false
		end)
	end)
end

RJumpscare.OnClientEvent:Connect(doDuck)

--------------------------------------------------------------------------
-- 4) TV PROMPT — code + color dialog, invokes TVSubmit
--------------------------------------------------------------------------

local tvOpen = false

local function closeTV(dialog)
	if not dialog or not dialog.Parent then
		return
	end
	local sc = dialog:FindFirstChildOfClass("UIScale")
	if sc then
		tween(sc, TweenInfo.new(0.2, Enum.EasingStyle.Back, Enum.EasingDirection.In), { Scale = 0.05 })
	end
	task.delay(0.22, function()
		if dialog.Parent then
			dialog.Parent:Destroy() -- destroys the dim backdrop too
		end
		tvOpen = false
	end)
end

local function openTV()
	if tvOpen then
		return
	end
	tvOpen = true

	local backdrop = mk("Frame", {
		Name = "TVBackdrop",
		Size = UDim2.new(1, 0, 1, 0),
		BackgroundColor3 = Color3.fromRGB(0, 0, 0),
		BackgroundTransparency = 0.45,
		BorderSizePixel = 0,
		ZIndex = 40,
	}, gui)

	local dialog = mk("Frame", {
		Name = "TVDialog",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0, 380, 0, 330),
		BackgroundColor3 = Color3.fromRGB(30, 30, 40),
		BorderSizePixel = 0,
		ZIndex = 41,
	}, backdrop)
	corner(dialog, 16)
	local dialogStroke = stroke(dialog, Color3.fromRGB(120, 200, 255), 3, 0)

	local dscale = mk("UIScale", { Scale = 0.1 }, dialog)
	tween(dscale, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 })

	-- TV antenna decoration
	mk("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 0, 6),
		Size = UDim2.new(0, 120, 0, 34),
		BackgroundTransparency = 1,
		Text = "\\  /",
		TextColor3 = Color3.fromRGB(120, 200, 255),
		Font = Enum.Font.GothamBold,
		TextSize = 30,
		ZIndex = 41,
	}, dialog)

	mk("TextLabel", {
		Position = UDim2.new(0, 0, 0, 12),
		Size = UDim2.new(1, 0, 0, 34),
		BackgroundTransparency = 1,
		Text = "== SECRET TV ==",
		TextColor3 = Color3.fromRGB(120, 200, 255),
		Font = Enum.Font.GothamBold,
		TextSize = 26,
		ZIndex = 42,
	}, dialog)

	mk("TextLabel", {
		Position = UDim2.new(0, 0, 0, 44),
		Size = UDim2.new(1, 0, 0, 22),
		BackgroundTransparency = 1,
		Text = "Enter what you discovered...",
		TextColor3 = Color3.fromRGB(180, 180, 200),
		Font = Enum.Font.Gotham,
		TextSize = 15,
		ZIndex = 42,
	}, dialog)

	local function makeBox(yPos, placeholder)
		local box = mk("TextBox", {
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, yPos),
			Size = UDim2.new(0.82, 0, 0, 44),
			BackgroundColor3 = Color3.fromRGB(18, 18, 26),
			Text = "",
			PlaceholderText = placeholder,
			PlaceholderColor3 = Color3.fromRGB(110, 110, 130),
			TextColor3 = Color3.fromRGB(255, 255, 255),
			Font = Enum.Font.GothamBold,
			TextSize = 20,
			ClearTextOnFocus = false,
			BorderSizePixel = 0,
			ZIndex = 42,
		}, dialog)
		corner(box, 10)
		stroke(box, Color3.fromRGB(90, 100, 140), 2, 0.2)
		return box
	end

	local codeBox = makeBox(76, "SECRET CODE")
	local colorBox = makeBox(130, "COLOR")

	local msgLabel = mk("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 240),
		Size = UDim2.new(0.9, 0, 0, 40),
		BackgroundTransparency = 1,
		Text = "",
		TextColor3 = Color3.fromRGB(255, 220, 120),
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextWrapped = true,
		ZIndex = 42,
	}, dialog)

	local submit = mk("TextButton", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 188),
		Size = UDim2.new(0.6, 0, 0, 46),
		BackgroundColor3 = Color3.fromRGB(60, 180, 90),
		Text = "SUBMIT",
		TextColor3 = Color3.fromRGB(255, 255, 255),
		Font = Enum.Font.GothamBold,
		TextSize = 22,
		BorderSizePixel = 0,
		AutoButtonColor = true,
		ZIndex = 42,
	}, dialog)
	corner(submit, 12)
	stroke(submit, Color3.fromRGB(150, 255, 180), 2, 0.2)

	local closeBtn = mk("TextButton", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 8),
		Size = UDim2.new(0, 32, 0, 32),
		BackgroundColor3 = Color3.fromRGB(200, 70, 70),
		Text = "X",
		TextColor3 = Color3.fromRGB(255, 255, 255),
		Font = Enum.Font.GothamBold,
		TextSize = 18,
		BorderSizePixel = 0,
		ZIndex = 43,
	}, dialog)
	corner(closeBtn, 10)

	closeBtn.MouseButton1Click:Connect(function()
		closeTV(dialog)
	end)

	local submitting = false
	submit.MouseButton1Click:Connect(function()
		if submitting then
			return
		end
		submitting = true
		submit.Text = "..."
		local ok, message
		local success, err = pcall(function()
			ok, message = RTVSubmit:InvokeServer(codeBox.Text, colorBox.Text)
		end)
		if not success then
			ok = false
			message = "TV static... try again! (" .. tostring(err) .. ")"
		end
		msgLabel.Text = tostring(message or "")
		if ok then
			-- green glow + close
			msgLabel.TextColor3 = Color3.fromRGB(140, 255, 160)
			dialogStroke.Color = Color3.fromRGB(90, 255, 130)
			tween(dialog, TweenInfo.new(0.3), { BackgroundColor3 = Color3.fromRGB(25, 60, 35) })
			tween(dialogStroke, TweenInfo.new(0.3), { Thickness = 6 })
			playSound("rbxassetid://12222124", 0.8, 1.4)
			task.delay(1.2, function()
				closeTV(dialog)
			end)
		else
			msgLabel.TextColor3 = Color3.fromRGB(255, 120, 120)
			-- little shake of the dialog
			task.spawn(function()
				local base = dialog.Position
				for i = 1, 4 do
					dialog.Position = base + UDim2.new(0, (i % 2 == 0) and 6 or -6, 0, 0)
					task.wait(0.05)
				end
				dialog.Position = base
			end)
			submit.Text = "SUBMIT"
			submitting = false
		end
	end)

	-- ESC-ish: any keyboard Escape attempt or Backspace-on-nothing closes via close button;
	-- Roblox reserves Esc, so also close on X. Bind X key does nothing special here.
	local conn
	conn = UserInputService.InputBegan:Connect(function(input, processed)
		if input.KeyCode == Enum.KeyCode.Escape then
			if conn then
				conn:Disconnect()
			end
			closeTV(dialog)
		end
	end)
	backdrop.AncestryChanged:Connect(function()
		if not backdrop.Parent and conn then
			conn:Disconnect()
		end
	end)
end

RTVPrompt.OnClientEvent:Connect(openTV)

--------------------------------------------------------------------------
-- 5) NUKE ALERT — red vignette, shaking siren text, camera shake
--------------------------------------------------------------------------

local nukeBusy = false

local function doNukeAlert(attackerName)
	if nukeBusy then
		return
	end
	nukeBusy = true

	local overlay = mk("Frame", {
		Name = "NukeOverlay",
		Size = UDim2.new(1, 0, 1, 0),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ZIndex = 45,
	}, gui)

	-- vignette: four red edge bars that pulse
	local edges = {}
	local function edge(props)
		local f = mk("Frame", {
			BackgroundColor3 = Color3.fromRGB(255, 30, 30),
			BackgroundTransparency = 0.55,
			BorderSizePixel = 0,
			ZIndex = 45,
			Position = props.Position,
			Size = props.Size,
		}, overlay)
		table.insert(edges, f)
	end
	edge({ Position = UDim2.new(0, 0, 0, 0), Size = UDim2.new(1, 0, 0, 60) })
	edge({ Position = UDim2.new(0, 0, 1, -60), Size = UDim2.new(1, 0, 0, 60) })
	edge({ Position = UDim2.new(0, 0, 0, 0), Size = UDim2.new(0, 60, 1, 0) })
	edge({ Position = UDim2.new(1, -60, 0, 0), Size = UDim2.new(0, 60, 1, 0) })

	local siren = mk("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.28, 0),
		Size = UDim2.new(0.9, 0, 0, 90),
		BackgroundTransparency = 1,
		Text = "!! " .. string.upper(tostring(attackerName)) .. " LAUNCHED A NUKE !!",
		TextColor3 = Color3.fromRGB(255, 60, 60),
		Font = Enum.Font.GothamBold,
		TextSize = 44,
		TextScaled = true,
		ZIndex = 46,
	}, overlay)
	stroke(siren, Color3.fromRGB(60, 0, 0), 4, 0)

	playSound("rbxassetid://12222124", 1, 0.5)

	-- shake text + pulse vignette for 4s
	task.spawn(function()
		local elapsed = 0
		local conn
		conn = RunService.Heartbeat:Connect(function(dt)
			elapsed = elapsed + dt
			if elapsed >= 4 or not siren.Parent then
				conn:Disconnect()
				return
			end
			siren.Position = UDim2.new(
				0.5, math.random(-10, 10),
				0.28, math.random(-8, 8)
			)
			siren.Rotation = math.random(-3, 3)
			local pulse = 0.35 + 0.3 * math.abs(math.sin(elapsed * 8))
			for _, f in ipairs(edges) do
				f.BackgroundTransparency = pulse
			end
		end)
	end)

	-- camera shake via Humanoid.CameraOffset jitter, 2s
	task.spawn(function()
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if not hum then
			return
		end
		local elapsed = 0
		local conn
		conn = RunService.Heartbeat:Connect(function(dt)
			elapsed = elapsed + dt
			if elapsed >= 2 or not hum.Parent then
				conn:Disconnect()
				if hum.Parent then
					hum.CameraOffset = Vector3.new(0, 0, 0)
				end
				return
			end
			local mag = 0.6 * (1 - elapsed / 2)
			hum.CameraOffset = Vector3.new(
				(math.random() - 0.5) * 2 * mag,
				(math.random() - 0.5) * 2 * mag,
				(math.random() - 0.5) * 2 * mag
			)
		end)
	end)

	task.delay(4, function()
		for _, f in ipairs(edges) do
			tween(f, TweenInfo.new(0.6), { BackgroundTransparency = 1 })
		end
		tween(siren, TweenInfo.new(0.6), { TextTransparency = 1, TextStrokeTransparency = 1 })
		task.delay(0.7, function()
			overlay:Destroy()
			nukeBusy = false
		end)
	end)
end

RNukeAlert.OnClientEvent:Connect(function(attackerName)
	doNukeAlert(attackerName)
end)

--------------------------------------------------------------------------
-- 6) WIN GAME — victory screen for the winner, banner for everyone else
--------------------------------------------------------------------------

local CONFETTI_CHARS = { "*", "o", "+", "x", "#" }

local function rainConfetti(parent, count, duration)
	for i = 1, count do
		task.delay(math.random() * (duration * 0.6), function()
			if not parent.Parent then
				return
			end
			local piece = mk("TextLabel", {
				Position = UDim2.new(math.random(), 0, -0.1, 0),
				Size = UDim2.new(0, 30, 0, 30),
				BackgroundTransparency = 1,
				Text = CONFETTI_CHARS[math.random(1, #CONFETTI_CHARS)],
				TextColor3 = Color3.fromHSV(math.random(), 0.85, 1),
				Font = Enum.Font.GothamBold,
				TextSize = math.random(20, 38),
				Rotation = math.random(-180, 180),
				ZIndex = 61,
			}, parent)
			local fallTime = 1.6 + math.random() * 1.6
			tween(piece, TweenInfo.new(fallTime, Enum.EasingStyle.Linear), {
				Position = UDim2.new(piece.Position.X.Scale + (math.random() - 0.5) * 0.2, 0, 1.1, 0),
				Rotation = piece.Rotation + math.random(-360, 360),
			})
			task.delay(fallTime, function()
				piece:Destroy()
			end)
		end)
	end
end

local function doWinGame(winnerName)
	if winnerName == player.Name then
		-- FULL victory screen
		local overlay = mk("Frame", {
			Name = "WinOverlay",
			Size = UDim2.new(1, 0, 1, 0),
			BackgroundColor3 = Color3.fromRGB(10, 10, 30),
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			ZIndex = 60,
		}, gui)
		tween(overlay, TweenInfo.new(0.5), { BackgroundTransparency = 0.35 })

		local winText = mk("TextLabel", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.5, 0, 0.42, 0),
			Size = UDim2.new(0.95, 0, 0, 140),
			BackgroundTransparency = 1,
			Text = "YOU WIN THE GAME!!!",
			TextColor3 = Color3.fromRGB(255, 255, 255),
			Font = Enum.Font.GothamBold,
			TextSize = 80,
			TextScaled = true,
			ZIndex = 62,
		}, overlay)
		local winStroke = stroke(winText, Color3.fromRGB(255, 255, 255), 4, 0)

		local sub = mk("TextLabel", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.5, 0, 0.56, 0),
			Size = UDim2.new(0.8, 0, 0, 40),
			BackgroundTransparency = 1,
			Text = "BOSS TYCOON CHAMPION",
			TextColor3 = Color3.fromRGB(255, 230, 120),
			Font = Enum.Font.GothamBold,
			TextSize = 28,
			ZIndex = 62,
		}, overlay)

		playSound("rbxassetid://12222124", 1, 1)

		-- rainbow cycling text
		task.spawn(function()
			local elapsed = 0
			local conn
			conn = RunService.Heartbeat:Connect(function(dt)
				elapsed = elapsed + dt
				if elapsed >= 10 or not winText.Parent then
					conn:Disconnect()
					return
				end
				local hue = (elapsed * 0.5) % 1
				winText.TextColor3 = Color3.fromHSV(hue, 0.8, 1)
				winStroke.Color = Color3.fromHSV((hue + 0.5) % 1, 0.9, 1)
				winText.Rotation = 2 * math.sin(elapsed * 3)
			end)
		end)

		rainConfetti(overlay, 90, 8)

		task.delay(10, function()
			tween(overlay, TweenInfo.new(1), { BackgroundTransparency = 1 })
			tween(winText, TweenInfo.new(1), { TextTransparency = 1 })
			tween(sub, TweenInfo.new(1), { TextTransparency = 1 })
			tween(winStroke, TweenInfo.new(1), { Transparency = 1 })
			task.delay(1.1, function()
				overlay:Destroy()
			end)
		end)
	else
		-- banner for everybody else
		local banner = mk("Frame", {
			Name = "WinBanner",
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, -80),
			Size = UDim2.new(0, 560, 0, 64),
			BackgroundColor3 = Color3.fromRGB(40, 25, 70),
			BorderSizePixel = 0,
			ZIndex = 60,
		}, gui)
		corner(banner, 14)
		local bStroke = stroke(banner, Color3.fromRGB(255, 220, 90), 3, 0)

		local bText = mk("TextLabel", {
			Size = UDim2.new(1, -20, 1, 0),
			Position = UDim2.new(0, 10, 0, 0),
			BackgroundTransparency = 1,
			Text = tostring(winnerName) .. " HAS WON THE GAME!",
			TextColor3 = Color3.fromRGB(255, 230, 120),
			Font = Enum.Font.GothamBold,
			TextSize = 26,
			TextScaled = true,
			ZIndex = 61,
		}, banner)

		tween(banner, TweenInfo.new(0.5, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
			Position = UDim2.new(0.5, 0, 0, 80),
		})
		rainConfetti(gui, 30, 4)

		task.delay(6, function()
			tween(banner, TweenInfo.new(0.5, Enum.EasingStyle.Back, Enum.EasingDirection.In), {
				Position = UDim2.new(0.5, 0, 0, -90),
			})
			task.delay(0.6, function()
				banner:Destroy()
			end)
		end)
	end
end

RWinGame.OnClientEvent:Connect(function(winnerName)
	doWinGame(tostring(winnerName))
end)

--------------------------------------------------------------------------
-- 7) LAB FOG — local Lighting spookiness while in the lab
--------------------------------------------------------------------------

local savedLighting = nil

local function setLabFog(enabled)
	if enabled then
		if not savedLighting then
			savedLighting = {
				FogEnd = Lighting.FogEnd,
				FogStart = Lighting.FogStart,
				FogColor = Lighting.FogColor,
				Ambient = Lighting.Ambient,
				OutdoorAmbient = Lighting.OutdoorAmbient,
				Brightness = Lighting.Brightness,
				ClockTime = Lighting.ClockTime,
			}
		end
		Lighting.FogEnd = 60
		Lighting.FogStart = 5
		Lighting.FogColor = Color3.fromRGB(0, 0, 0)
		Lighting.Ambient = Color3.fromRGB(8, 8, 12)
		Lighting.OutdoorAmbient = Color3.fromRGB(8, 8, 12)
		Lighting.Brightness = 0.5
		Lighting.ClockTime = 0
	else
		if savedLighting then
			Lighting.FogEnd = savedLighting.FogEnd
			Lighting.FogStart = savedLighting.FogStart
			Lighting.FogColor = savedLighting.FogColor
			Lighting.Ambient = savedLighting.Ambient
			Lighting.OutdoorAmbient = savedLighting.OutdoorAmbient
			Lighting.Brightness = savedLighting.Brightness
			Lighting.ClockTime = savedLighting.ClockTime
			savedLighting = nil
		end
	end
end

RLabFog.OnClientEvent:Connect(function(enabled)
	setLabFog(enabled and true or false)
end)
