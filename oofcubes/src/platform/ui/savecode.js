// src/platform/ui/savecode.js — spec 07 §5.8: the Settings rows that get an account
// off one device and onto another.
//
// The whole design premise is that a save code is a thing a kid pastes into a chat with
// themselves. So: the export box selects its own text on tap, the import box shrugs off
// the newlines a messaging app inserts, and nothing is written until a confirm dialog
// has spelled out exactly what is about to be replaced.

import { el, button } from "./kit.js";

const BOX = "width:100%;box-sizing:border-box;min-height:88px;margin:6px 0;padding:8px;"
  + "border-radius:8px;border:1px solid #2f3338;background:#101014;color:#dfe4ea;"
  + "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;"
  + "line-height:1.35;word-break:break-all;resize:vertical;";

function styled(node, css) {
  node.setAttribute("style", css);
  return node;
}

// mountSaveCodeRows(body, deps) — deps = { saves, confirmDialog, toast }.
export function mountSaveCodeRows(body, deps) {
  const { saves, confirmDialog, toast } = deps;

  body.appendChild(el("div", "oof-section-label", "SAVE DATA"));
  body.appendChild(styled(
    el("div", null, "Your progress lives in this browser. Export a code to move it to another device."),
    "font-size:12px;color:#9aa3b8;margin-bottom:8px;"
  ));

  // ---- export ----
  const outBox = document.createElement("textarea");
  outBox.setAttribute("style", BOX);
  outBox.readOnly = true;
  outBox.placeholder = "Your save code will appear here.";
  outBox.addEventListener("focus", () => outBox.select());
  const exportNote = styled(el("div", null, ""), "font-size:12px;color:#9aa3b8;margin:0 0 10px;");

  body.appendChild(button({
    label: "Export save code",
    variant: "secondary",
    onClick: () => {
      const res = saves.exportSaveCode();
      if (!res.ok) {
        outBox.value = "";
        exportNote.textContent = res.error;
        exportNote.style.color = "#ff6b6b";
        return;
      }
      outBox.value = res.code;
      outBox.focus();
      exportNote.style.color = "#7ac74f";
      exportNote.textContent = `${res.chars} characters — copy all of it.`;
      // Clipboard is a convenience, never the only route: the box holds the code
      // whether or not the browser allows a programmatic copy.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(res.code).then(
          () => { exportNote.textContent = `Copied! ${res.chars} characters.`; },
          () => { /* the selected textarea is the fallback, and it is already there */ }
        );
      }
    },
  }));
  body.appendChild(outBox);
  body.appendChild(exportNote);

  // ---- import ----
  const inBox = document.createElement("textarea");
  inBox.setAttribute("style", BOX);
  inBox.placeholder = "Paste a save code here…";
  const importNote = styled(el("div", null, ""), "font-size:12px;color:#9aa3b8;margin:0 0 10px;");

  body.appendChild(inBox);
  body.appendChild(button({
    label: "Import save code",
    variant: "secondary",
    onClick: async () => {
      const res = saves.importSaveCode(inBox.value);
      if (!res.ok) {
        importNote.style.color = "#ff6b6b";
        importNote.textContent = res.error;
        return;
      }
      const s = res.summary;
      const when = s.exportedAt ? new Date(s.exportedAt).toLocaleDateString() : "an unknown date";
      const places = s.places.length ? s.places.join(", ") : "no places";
      importNote.style.color = "#9aa3b8";
      importNote.textContent = `Code looks good: ${s.balance} Oofbux, ${s.badgeCount} badges.`;
      const yes = await confirmDialog(
        "Replace everything?",
        `This code has ${s.balance} Oofbux, ${s.badgeCount} badges and ${places}, saved on ${when}. `
        + "Importing REPLACES what is on this device. Your current save is backed up first, "
        + "and the page will reload."
      );
      if (!yes) {
        importNote.textContent = "Import cancelled — nothing changed.";
        return;
      }
      saves.applyImport(res.parsed);
    },
  }));
  body.appendChild(importNote);

  // ---- the destructive one, last and behind a confirm ----
  body.appendChild(button({
    label: "Reset all data",
    variant: "secondary",
    onClick: async () => {
      const yes = await confirmDialog(
        "Erase everything?",
        "This deletes your Oofbux, badges, avatar and every Place's progress on this device. "
        + "It cannot be undone. Export a save code first if you might want it back."
      );
      if (!yes) return;
      saves.resetAll();
      if (toast) toast({ icon: "🧹", title: "All data erased", body: "Reloading…" });
      if (typeof location !== "undefined" && location.reload) location.reload();
    },
  }));
}
