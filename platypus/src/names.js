// names.js - player names (LEVELS3.md A3). Pure: no DOM, no network.
//   checkName(raw) -> { ok: true, name } | { ok: false, reason: "short" | "long" | "chars" | "letters" | "rude" }
//   normalizeName(raw) -> the folded form the filter tests (NOT the uniqueness key; that is lower(name))
// The same algorithm runs on the server (supabase/schema.sql, platy_name_ok) and the same word lists are seeded
// there by tools/gen-wordlists.cjs, so client and server cannot drift.
//
// The filter:
//  1. lower-case, strip diacritics (NFKD, drop combining marks)
//  2. a second copy gets the leet / look-alike map (0->o 1->i 3->e 4->a 5->s 7->t @->a $->s ...) and ph->f vv->w ck->k q->k
//  3. everything that is not a-z goes (so "f u c k", "f.u.c.k", "f_u-c_k" fold together)
//  4. each copy is also tested with runs of one letter collapsed to one ("fuuuck") and to two ("asssss")
//  5. a banned stem anywhere in any copy rejects the name, UNLESS that occurrence lies entirely inside an allowed
//     innocent word at the same spot ("Bass Player", "Classy", "Dickens", "Scunthorpe"). (Covering, not deleting:
//     deleting allowed words first would let "glass" hide inside a rude word and join its two halves.)
// The lists are ROT13 below so the source stays clean to read. Decoded, every entry is folded both ways.

export const NAME_MIN = 3, NAME_MAX = 16;

// banned stems: English plus Spanish, Portuguese, French, German, Italian, Dutch, Polish, Russian, Turkish, Indonesian,
// Tagalog and Hindi (transliterated): sexual terms, slurs, excrement, self-harm, Nazi terms, impersonation
// BEGIN BANNED
const BANNED_R13 =
  "shpx shx spx sphx cuhpx shxx shpxre shpxvat shpxva shpxsnpr shpxurnq shpxjvg zbgureshpx zbsb fgsh tgsb jgs " +
  "shone fuvg fuvgr fuvggl ohyyfuvg fuvgurnq fuvgsnpr qvcfuvg ubefrfuvg ongfuvg nff nffubyr nefrubyr nefr " +
  "nffjvcr nffung nffpybja wnpxnff qhzonff sngnff onqnff fznegnff xvffzlnff ovgpu ovngpu ovgpul fbabsnovgpu " +
  "ogpu onfgneq onfgnq phag xhag phagsnpr gjng qvpx qvpxurnq qvpxsnpr qvpxjnq pbpx pbpxfhpx pbpxurnq chffl " +
  "chffvrf cravf crra intvan ihyin pyvg pyvgbevf ynovn obbo obbof obbovrf gvggl gvggvrf gvgf gvggvr cbea cbeab " +
  "cbeauho kkk kivqrbf baylsnaf oenmmref frk frkl frkk frkhny frkgvat ahqr ahqrf anxrq phz phzfubg wvmm wvfz " +
  "frzra fcrez fchax qvyqb ivoengbe ohggcyht oybjwbo unaqwbo evzwbo sbbgwbo betnfz betl ubeal obare rerpgvba " +
  "nany nahf ohggubyr ohggfrk encr encvfg encvat zbyrfg crqb crqbcuvyr cnrqb crqborne tebbzre vaprfg " +
  "orfgvnyvgl mbbcuvyr arpeb zvys qvys uragnv ehyr34 afsj fyhg fyhggl juber fxnax gubg ubbxre cebfgvghgr jnax " +
  "jnaxre gbffre wrexbss wnpxbss znfgheong snc snccvat obyybpx obyybpxf ohttre cvff cvffrq cvffbss penc penccl " +
  "qbhpur qbhpuront avttre avttn avtt avte avtn arteb artebvq avtabt puvax tbbx tbbxf fcvp jrgonpx ornare xvxr " +
  "xlxr lvq enturnq gbjryurnq fnaqavttre pnzrywbpxrl pbba wvtnobb cbepuzbaxrl whatyrohaal tbyyvjbt qnexvr cnxv " +
  "cnxvf tlccb tlcb jbc qntb ubaxl ubaxrl puvatpubat snt sntt snttbg sntbg snttvg qlxr genaal furznyr ynqlobl " +
  "ubzb ubzbf dhrre yrfob cbbsgre ergneq ergneqrq fcnm fcnfgvp zbatbybvq pevccyr anmv anmvf arbanmv uvgyre " +
  "urvyuvgyre fvrturvy fjnfgvxn shuere xxx juvgrcbjre juvgrcevqr tnfpunzore ubybpnhfg nhfpujvgm ff88 1488 " +
  "sbhegrra88 tnfgurwrjf xvyywrjf xlf xvyylbhefrys xvyyhefrys xzf fhvpvqr fhvpvqny frysunez phgzlfrys " +
  "phglbhefrys unatlbhefrys arpxlbhefrys greebevfg nydnrqn gnyvona nqzva nqzvavfgengbe zbqrengbe eboybk " +
  "cynglsl bssvpvny chgn chgb chgnf chgbf uvwbchgn uvwbqrchgn zvreqn pnoeba pnoeban craqrwb craqrwn iretn " +
  "puvatn puvatnqn puvatne puvathr phyreb wbqre wbqrgr tvyvcbyynf znevpn znevpba mbeen sbyyne pbwbarf pbtre " +
  "znycnevqb znycnevqn cvapur pnenwb pnenyub ohprgn ivnqb zreqn sbqre sbqnfr sbqvqb chaurgn phmnb neebzonqb " +
  "kbkbgn zreqr chgnva fnybcr pbaaneq pbaanffr raphyr raphyre ongneq avdhre avdhrgnzrer crgnffr oenayrhe " +
  "rasbver pbhvyyr pbhvyyrf gnthrhyr fpurvffr fpurvff sbgmr uherafbua nefpuybpu nefpu jvpufre fpuynzcr svpxra " +
  "fpujhpugry zvfgfghrpx artre xnanxr fcnfg zvfftroheg qerpxfnh pnmmb inssnaphyb snaphyb fgebamb chggnan gebvn " +
  "zvapuvn pbtyvbar sebpvb onfgneqb cbepbqvb cbepnznqbaan xnaxre xybbgmnx tbqireqbzzr arhx arhxra xnaxreyvwre " +
  "zbatbby syvxxre glshf xhgjvws xhejn puhw puhwbjl cvreqby cvreqbyr cvreqbyvp wronp wronal wronan cvmqn " +
  "fxhejlfla fcvreqnynw pjry qhcrx oylng oylnq fhxn plxn cvmqrp cvmqrgf xuhl uhvyb lrong lbonal cvqbe cvqne " +
  "cvqnenf zhqnx tnaqba mnyhcn tbiab fuylhxun royna bebfch fvxgve lneenx crmrirax tning fvxvf fvxrevz " +
  "nzvanxblvz tbgirera voar xnucr nawvat onatfng xbagby zrzrx atragbg onwvatna wnapbx tboybx gbyby atrjr crcrx " +
  "gvgvg crerx chgnatvan gnatvan tntb gnenagnqb hyby xhcny xnagbg wnxby oheng chxvatvanzb cnxlh chalrgn " +
  "puhgvln puhgvlr znqnepubq znqrepubq ourapubq orurapubq oubfqv oubfqvxr oubfnqvxr tnnaq tnaqh yniqn unenzv " +
  "unenzmnqn ounqjn wunng pubqh ofqx nfubyr shpxlbh shpxbss fhpxzlqvpx fhpxvg pbpxfhpxre anmvfz xxxx avtte " +
  "avoon avtthu ovgpunff fuvgnff shpxobl shpxtvey frkfynir cbeafgne pnztvey ";
// END BANNED

// innocent words that contain a banned stem
// BEGIN ALLOWED
const ALLOWED_R13 =
  "pynff pynffl pynffvp tenff tynff oenff cnff cnffvba cnffvat pbzcnff onff onffbba ynff ynffvr znff znffvir " +
  "fnff fnffl pnff pnffvr pnffvql nffvfg nffhzr nffrzoyr nffrg nffnffva rzonffl wnffvq unffyr gnffry inffny " +
  "pbpxgnvy pbpxngbb pbpxcvg pbpxebnpu pbpxyr crnpbpx unapbpx uvgpupbpx fuhggyrpbpx jbbqpbpx tnzrpbpx onopbpx " +
  "qvpxraf qvpxvafba qvpxrl qvpxfba orarqvpx fphagubecr phagvat fuvgnxr fuvvgnxr fhffrk rffrk zvqqyrfrk " +
  "frkgnag frkgrg frkgba nanybt nanylfg nanylfvf nanylgvp pnany onany tencr qencr gencrmr fpencr encrfrrq " +
  "fpenc fpenccl enppbba pbpbba glpbba wncna fcvpr fcvpl pbafcvphbhf fcvpre ubzre ubzrznqr ubzbtra phphzore " +
  "qbphzrag pvephz phzhyhf npphzhy phzorefbzr pbzchgn erchgn qrchgn nzchgn vzchgn qvfchgn fxlfpencre fxl " +
  "fxlyre gvgna gvgnavp fgvgpu crgvg uryyb furyy gurencvfg ohggre ohggba zbqry zbqrea unffna unff xnff gnff " +
  "enff anff nffnz cnffvir znffnpuhfrggf cvpnffb cnencrg xnany anmve pbbarl inphhz phzva phzzvat gnyphz trbet " +
  "wnahf henahf znahf nahfu cnxvfgna onqzvagba fjnax shxhbxn shxhfuvzn pbxr pbxvr qvxrzo orarqvxg avtrevn " +
  "qvpxvr phzore nanyvfr ";
// END ALLOWED

const LEET = { "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "l", "+": "t", "€": "e", "£": "l", "¥": "y" };

function rot13(s) {
  return s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
}
function deaccent(s) {
  return s.normalize ? s.normalize("NFKD").replace(/[̀-ͯ]/g, "") : s;
}
// the SQL platy_fold(t, leet), character for character
export function fold(t, leet) {
  let s = String(t).toLowerCase();
  if (leet) {
    let o = "";
    for (const ch of s) o += LEET[ch] !== undefined ? LEET[ch] : ch;
    s = o.replace(/ph/g, "f").replace(/vv/g, "w").replace(/ck/g, "k").replace(/q/g, "k");
  }
  return s.replace(/[^a-z]/g, "");
}
const collapse1 = (s) => s.replace(/(.)\1+/g, "$1");
const collapse2 = (s) => s.replace(/(.)\1\1+/g, "$1$1");

// the six copies of a name that are tested
export function forms(raw) {
  const v = deaccent(String(raw));
  const a = fold(v, false), b = fold(v, true);
  return [a, b, collapse1(a), collapse1(b), collapse2(a), collapse2(b)];
}

function decode(r) { return r.trim() ? r.trim().split(/\s+/).map(rot13) : []; }
function uniq(a) { const s = new Set(); for (const w of a) if (w.length >= 3) s.add(w); return Array.from(s); }
const BANNED_RAW = decode(BANNED_R13), ALLOWED_RAW = decode(ALLOWED_R13);
// a banned stem is tested in its plain and its leet-folded spelling
const BANNED = uniq(BANNED_RAW.flatMap((w) => [fold(w, false), fold(w, true)]));
// an allowed word may cover a match in any copy of the name, so all its copies are listed
const ALLOWED = uniq(ALLOWED_RAW.flatMap((w) => {
  const a = fold(w, false), b = fold(w, true);
  return [a, b, collapse1(a), collapse1(b), collapse2(a), collapse2(b)];
}));
// the folded lists, exactly as they are seeded into banned_words / allowed_words (tools/gen-wordlists.cjs)
export function wordLists() {
  return { banned: BANNED.slice(), allowed: ALLOWED.slice(), bannedStems: BANNED_RAW.length, allowedWords: ALLOWED_RAW.length };
}

// is the occurrence of banned word b at index p of c inside an allowed word at the same spot?
function excused(c, p, b) {
  for (let i = 0; i < ALLOWED.length; i++) {
    const a = ALLOWED[i];
    if (a.length < b.length) continue;
    let s = a.indexOf(b);
    while (s >= 0) {
      const st = p - s;
      if (st >= 0 && c.substr(st, a.length) === a) return true;
      s = a.indexOf(b, s + 1);
    }
  }
  return false;
}
function rudeForm(c) {
  for (let i = 0; i < BANNED.length; i++) {
    const b = BANNED[i];
    let p = c.indexOf(b);
    while (p >= 0) {
      if (!excused(c, p, b)) return true;
      p = c.indexOf(b, p + 1);
    }
  }
  return false;
}
export function isRude(raw) {
  const f = forms(raw);
  for (let i = 0; i < f.length; i++) if (rudeForm(f[i])) return true;
  return false;
}

// trim, inner whitespace to one space (this is how the name is displayed)
export function cleanName(raw) { return String(raw === undefined || raw === null ? "" : raw).trim().replace(/\s+/g, " "); }
export function normalizeName(raw) { return fold(deaccent(cleanName(raw)), true); }

export function checkName(raw) {
  const name = cleanName(raw);
  if (name.length < NAME_MIN) return { ok: false, reason: "short" };
  if (name.length > NAME_MAX) return { ok: false, reason: "long" };
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return { ok: false, reason: "chars" };
  if (name.replace(/[^A-Za-z]/g, "").length < 2) return { ok: false, reason: "letters" };
  if (isRude(name)) return { ok: false, reason: "rude" };
  return { ok: true, name };
}

// the hint line under the name field
export function nameHint(reason) {
  switch (reason) {
    case "short": case "long": return "3 to 16 letters";
    case "chars": return "Only letters, numbers, space, - and _";
    case "letters": return "Use at least two letters";
    case "rude": return "Let's pick a kinder name";
    case "taken": return "Someone already has that name - try another";
    default: return "";
  }
}

const ADJ = ["Brave", "Happy", "Sunny", "Swift", "Lucky", "Bouncy", "Clever", "Cosy", "Jolly", "Mighty", "Sparkly", "Zippy",
  "Gentle", "Bold", "Fuzzy", "Silly", "Shiny", "Misty", "Rapid", "Cheery", "Wobbly", "Snowy", "Golden", "Tiny"];
const NOUN = ["Otter", "Platypus", "Pebble", "Comet", "Paddle", "Ripple", "Puffin", "Badger", "Wombat", "Koala", "Lemur",
  "Gecko", "Panda", "Falcon", "Robin", "Splash", "Biscuit", "Muffin", "Noodle", "Pip", "Bubble", "Acorn", "Clover", "Tide"];
// a random safe name, "BraveOtter42" style (<= 16 characters)
export function randomName(rnd) {
  rnd = rnd || Math.random;
  for (let i = 0; i < 30; i++) {
    const s = ADJ[(rnd() * ADJ.length) | 0] + NOUN[(rnd() * NOUN.length) | 0] + String(10 + ((rnd() * 90) | 0));
    if (s.length <= NAME_MAX && checkName(s).ok) return s;
  }
  return "Pip" + String(100 + ((rnd() * 900) | 0));
}
