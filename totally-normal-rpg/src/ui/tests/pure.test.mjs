// pure.test.mjs - node tests for the UI's pure files (no DOM): node src/ui/tests/pure.test.mjs
import { validateName, onlineNameFor, friendlyNameError } from "../names.js";
import { commas, fmtLevel, fmtPopup, fmtMult, abbrev, fmtTime } from "../format.js";
import { ENDINGS, ENDING_IDS, BUTTON_LABELS, endingCard } from "../endings.js";

let fails = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}

// names (CONTRACT 9.3 / 14)
eq("idiot ok", validateName("idiot").ok, true);
eq("IDIOT ok", validateName("IDIOT").ok, true);
eq("special ok", [validateName("MyGranniesAMotherFucker").ok, validateName("MyGranniesAMotherFucker").special], [true, true]);
eq("special+2 rejected", validateName("mygranniesamotherfucker2").reason, "rude");
eq("rude rejected", validateName("fuck").reason, "rude");
eq("idiotfuck rejected", validateName("idiotfuck").reason, "rude");
eq("24 ok", validateName("abcdefghijklmnopqrstuvwx").ok, true);
eq("25 long", validateName("abcdefghijklmnopqrstuvwxy").reason, "long");
eq("short", validateName("ab").reason, "short");
eq("chars", validateName("bob!").reason, "chars");
eq("letters", validateName("1234").reason, "letters");
eq("trim/collapse", validateName("  Sir   Tester ").name, "Sir Tester");
eq("rude hint", friendlyNameError(validateName("fuck")), 'That word is too bad. The worst you can say is "idiot".');
eq("online special", onlineNameFor("MyGranniesAMotherFucker"), "MyGrannie");
eq("online long cut", onlineNameFor("Abcdefghijklmnopqrstu").length <= 16, true);
eq("online plain", onlineNameFor("Tester"), "Tester");

// format
eq("commas", commas(1234567), "1,234,567");
eq("commas small", commas(999), "999");
eq("level < 10M", fmtLevel(9999999), "9,999,999");
eq("level 12.4M", fmtLevel(12400000), "12.4M");
eq("level 123M", fmtLevel(123456789), "123M");
eq("level 1.23B", fmtLevel(1234567890), "1.23B");
eq("popup", fmtPopup(1400000), "1.40M");
eq("popup small", fmtPopup(12345), "12,345");
eq("abbrev rollover", abbrev(999999, 2), "1.00M");
eq("mult", [fmtMult(96), fmtMult(1.5), fmtMult(1.25), fmtMult(3456)], ["x96", "x1.5", "x1.25", "x3,456"]);
eq("time", [fmtTime(65 * 60000), fmtTime(12 * 60000)], ["1h 05m", "12m"]);

// endings: six cards, titles + short texts, buttons labelled
eq("six endings", ENDING_IDS.length, 6);
eq("all titled", ENDING_IDS.every((id) => /ENDING$/.test(ENDINGS[id].title) && ENDINGS[id].text.length > 10 && ENDINGS[id].text.length < 130), true);
eq("labels", [BUTTON_LABELS.winner, BUTTON_LABELS.remember], ["Winner", "Remember the choice"]);
eq("unknown ending card", endingCard("zzz").title, "ZZZ");

console.log(fails ? fails + " failed" : "all passed");
process.exit(fails ? 1 : 0);
