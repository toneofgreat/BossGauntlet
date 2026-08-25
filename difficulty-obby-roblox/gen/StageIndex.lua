local S = {}
local i = 1
while true do
	local m = script.Parent:FindFirstChild("StageData" .. i)
	if not m then break end
	local list = require(m)
	for j = 1, #list do
		S[#S + 1] = list[j]
	end
	i = i + 1
end
table.sort(S, function(a, b) return a.n < b.n end)
return S
