// Difficulty Chart Obby — assembler. See CONTRACT.md.
// Usage: node build.js [--check-only]
const fs = require('fs');
const path = require('path');
const luaparse = require('luaparse');
const { generate } = require('./generator');

const SRC = path.join(__dirname, 'src');
const GEN = path.join(__dirname, 'gen');
const OUT = path.join(__dirname, 'DifficultyChartObby.rbxlx');
const DESKTOP_OUT = 'C:/Users/krist/Desktop/DifficultyChartObby.rbxlx';

// 1. Generate + validate layout
const g = generate();
if (g.errors.length) {
  console.error(`Generator/validator errors (${g.errors.length}):`);
  for (const e of g.errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('Layout OK:', JSON.stringify(g.stats));

// 2. Syntax-check everything (Lua 5.1 grammar)
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
const readSrc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
const main = readSrc('Main.server.lua');
const clientUI = readSrc('ClientUI.client.lua');

console.log('Syntax check:');
check('Main.server.lua', main);
check('ClientUI.client.lua', clientUI);
for (const m of g.luaModules) check(m.name + '.lua (generated)', m.source);
if (failed) { console.error('\nSyntax errors — aborting.'); process.exit(1); }

// keep generated sources inspectable
fs.mkdirSync(GEN, { recursive: true });
for (const m of g.luaModules) fs.writeFileSync(path.join(GEN, m.name + '.lua'), m.source);
if (process.argv.includes('--check-only')) { console.log('\nAll checks pass.'); process.exit(0); }

// 3. Assemble rbxlx
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

const dataModules = g.luaModules.map((m) => scriptItem('ModuleScript', m.name, m.source)).join('\n');

const xml = `<roblox xmlns:xmime="http://schemas.microsoft.com/2003/10/Serialization/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
<Item class="Workspace" referent="${R()}">
<Properties>
<string name="Name">Workspace</string>
<bool name="StreamingEnabled">true</bool>
</Properties>
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
<Item class="Folder" referent="${R()}">
<Properties><string name="Name">DCOData</string></Properties>
${dataModules}
</Item>
</Item>
<Item class="ServerScriptService" referent="${R()}">
<Properties><string name="Name">ServerScriptService</string></Properties>
${scriptItem('Script', 'DCOMain', main)}
</Item>
<Item class="StarterPlayer" referent="${R()}">
<Properties><string name="Name">StarterPlayer</string></Properties>
<Item class="StarterPlayerScripts" referent="${R()}">
<Properties><string name="Name">StarterPlayerScripts</string></Properties>
${scriptItem('LocalScript', 'DCOClientUI', clientUI)}
</Item>
</Item>
</roblox>
`;

fs.writeFileSync(OUT, xml);
fs.writeFileSync(DESKTOP_OUT, xml);
console.log(`\nWrote ${OUT}`);
console.log(`Wrote ${DESKTOP_OUT}`);
console.log(`Size: ${(xml.length / 1024).toFixed(0)} KB, parts: ${g.stats.partCount}, stages: ${g.stats.stageCount}`);
