// Assembles lifting-simulator-roblox/src/*.lua into WeightLiftingSimulator.rbxlx
// and syntax-checks every file. Usage: node build.js [--check-only]
const fs = require('fs');
const path = require('path');
const luaparse = require('luaparse');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'WeightLiftingSimulator.rbxlx');
const DESKTOP_OUT = 'C:/Users/krist/Desktop/WeightLiftingSimulator.rbxlx';

const MODULES = [
  'Util', 'Config', 'Data', 'Rebirth', 'Lift', 'Shop', 'Leaderboard',
  'ItemModels1', 'ItemModels2', 'ItemModels3',
  'WorldGym', 'WorldSpace', 'WorldDumbbell', 'Auras',
];

let failed = false;
function check(name, code) {
  try {
    luaparse.parse(code, { luaVersion: '5.1' });
    console.log(`  OK   ${name}`);
  } catch (e) {
    failed = true;
    console.error(`  FAIL ${name}: ${e.message}`);
  }
  if (code.includes(']]' + '>')) {
    failed = true;
    console.error(`  FAIL ${name}: contains "]]>" which breaks CDATA`);
  }
}

function readSrc(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n/g, '\n');
}

const main = readSrc('Main.server.lua');
const clientUI = readSrc('ClientUI.client.lua');
const clientFX = readSrc('ClientFX.client.lua');
const mods = {};
for (const m of MODULES) mods[m] = readSrc(m + '.lua');

console.log('Syntax check (Lua 5.1 grammar):');
check('Main.server.lua', main);
check('ClientUI.client.lua', clientUI);
check('ClientFX.client.lua', clientFX);
for (const m of MODULES) check(m + '.lua', mods[m]);
if (failed) { console.error('\nSyntax errors — aborting.'); process.exit(1); }
if (process.argv.includes('--check-only')) { console.log('\nAll sources parse.'); process.exit(0); }

let ref = 0;
const R = () => 'RBX' + (ref++);
const cdata = (s) => `<![CDATA[${s}]]>`;

function scriptItem(cls, name, source, children = '') {
  return `<Item class="${cls}" referent="${R()}">
<Properties>
<string name="Name">${name}</string>
<ProtectedString name="Source">${cdata(source)}</ProtectedString>
</Properties>
${children}
</Item>`;
}

const moduleItems = MODULES.map((m) => scriptItem('ModuleScript', m, mods[m])).join('\n');

const xml = `<roblox xmlns:xmime="http://schemas.microsoft.com/2003/10/Serialization/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
<Item class="Workspace" referent="${R()}">
<Properties><string name="Name">Workspace</string></Properties>
</Item>
<Item class="Lighting" referent="${R()}">
<Properties>
<string name="Name">Lighting</string>
<float name="Brightness">2</float>
<float name="ClockTime">14</float>
</Properties>
</Item>
<Item class="ReplicatedStorage" referent="${R()}">
<Properties><string name="Name">ReplicatedStorage</string></Properties>
</Item>
<Item class="ServerScriptService" referent="${R()}">
<Properties><string name="Name">ServerScriptService</string></Properties>
${scriptItem('Script', 'LiftMain', main, moduleItems)}
</Item>
<Item class="StarterPlayer" referent="${R()}">
<Properties>
<string name="Name">StarterPlayer</string>
<token name="GameSettingsAvatar">1</token>
</Properties>
<Item class="StarterPlayerScripts" referent="${R()}">
<Properties><string name="Name">StarterPlayerScripts</string></Properties>
${scriptItem('LocalScript', 'LiftClientUI', clientUI)}
${scriptItem('LocalScript', 'LiftClientFX', clientFX)}
</Item>
</Item>
</roblox>
`;

fs.writeFileSync(OUT, xml);
fs.writeFileSync(DESKTOP_OUT, xml);
console.log(`\nWrote ${OUT}`);
console.log(`Wrote ${DESKTOP_OUT}`);
console.log(`Size: ${(xml.length / 1024).toFixed(0)} KB`);
