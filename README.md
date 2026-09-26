# WME Key Codes

A tiny, dependency-free library that is **one shared source of truth for keyboard mapping** in
[Waze Map Editor](https://www.waze.com/editor) userscripts.

---

## 🤖 FOR AI / LLM quick context

**Give this section to an assistant before asking it to touch WME keyboard shortcuts.** The same
summary is in the script header, so it travels with the `@require`d file.

| | |
|---|---|
| **What it is** | Dependency-free library converting between the shapes WME uses for keys: `"1,38"`, `"C+↑"`, `"Ctrl+Up"`, `"A+82"`. Loaded via Tampermonkey `@require`, used from global `WMEKeyCodes`. |
| **Use it for** | Registering / reading / storing WME SDK shortcuts, legacy `W.accelerators` migration, and any bug shaped like *"the shortcut is listed in WME Settings but does nothing"*. |
| **Do not** | Re-implement the keyCode / key-name tables locally. Pass `normalize().raw` (`"1,38"`) to `createShortcut()`. Guess which key format WME accepts. |
| **The one rule** | Register through `comboCandidates()` — it returns the spellings to try, in the order WME accepts them. |

### The trap this library exists to prevent

`Shortcuts.createShortcut({ shortcutKeys })` stores **any** string it is handed, and the shortcut
is listed in WME Settings even when a token cannot be resolved. WME resolves only three shapes:

| Spelling | Example | Binds? |
|---|---|---|
| character | `"G"` | ✅ |
| modifier letters + character | `"A+R"`, `"CS+R"` | ✅ |
| modifier letters + keyCode number | `"C+38"` (Ctrl+Up), `"C+32"` (Ctrl+Space) | ✅ |
| key *name* or glyph | `"C+↑"`, `"S+PageUp"` | ❌ stored, never fires |

A dead binding still passes `isShortcutRegistered()`, still reports a non-null key from
`getAllShortcuts()`, and still looks correct in WME Settings. **Only pressing the key proves it works.**

### TL;DR for code generation

```js
const record = WMEKeyCodes.normalize(savedValue);            // { raw, combo, keys }
for (const spelling of WMEKeyCodes.comboCandidates(record)) { // ['C+38','C+↑','1,38']
  try {
    wmeSDK.Shortcuts.createShortcut({ shortcutId, description, callback, shortcutKeys: spelling });
    break; // registered — press the key to confirm it fires
  } catch (err) {
    if (!String(err).includes('already in use')) throw err;
    break; // taken by WME or another script — leave the saved value alone
  }
}
```

---

WME stores and reports shortcuts in several different shapes at once:

| Shape | Example | Where it comes from |
|---|---|---|
| Raw machine form | `"1,38"` | what `shortcut.shortcutKeys` reports right after the user edits the key in WME's shortcut editor |
| Numeric combo | `"C+38"` | what `createShortcut()` needs for a key that has no letter/digit of its own (`"C+32"` = Ctrl+Space) |
| Readable combo | `"C+↑"` / `"C+Up"` | WME's shortcut UI, `W` accelerator keys |
| Bare keyCode | `"67"` | legacy `W.accelerators` persisted settings |
| Modifier + keyCode | `"A+82"` | legacy `W.accelerators` with a modifier (Alt+R) |
| Modifier + character | `"ACS+R"` | WME UI when several modifiers are held |

Every script that re-implements the conversion table on its own gets this subtly wrong, and the
failure mode is brutal: **an unrecognised key name silently converts to "no key"**, so the shortcut
still appears in WME's settings but never fires. This library makes the round-trip lossless and
identical across every script that `@require`s it.

```js
WMEKeyCodes.toRaw('Ctrl+Up')     // '1,38'
WMEKeyCodes.toCombo('1,38')      // 'C+↑'
WMEKeyCodes.normalize('1,38')    // { raw: '1,38', combo: 'C+↑', keys: '1,38' }
WMEKeyCodes.equals('C+↑', 'Ctrl+Up')          // true
WMEKeyCodes.comboCandidates({ raw: '1,38' })  // ['C+38', 'C+↑', '1,38']
```

---

## Installation

Published on Greasyfork as **[WME Key Codes](https://greasyfork.org/en/scripts/597539)** — script id `597539`, revision `1943401`.

Add a single `@require` to your userscript's metadata block:

```js
// ==UserScript==
// @name         My WME Script
// @require      https://update.greasyfork.org/scripts/597539/WME%20Key%20Codes.js
// ==/UserScript==
```

Use the **unversioned** URL above: it tracks the latest release, so consumers automatically pick up
fixes such as additions to the key or alias tables. Greasyfork also exposes each individual release
by revision id if you need a pinned, byte-for-byte reproducible build:

```js
// @require      https://update.greasyfork.org/scripts/597539/1943401/WME%20Key%20Codes.js
```

> Prefer the unversioned form unless you have a specific reason to pin. A stale key table is exactly
the failure this library exists to prevent, and a pinned `@require` will happily keep serving it.

The URL is percent-encoded because the published filename contains spaces (`WME Key Codes.js`).
Both spellings work; keep whichever Greasyfork gives you.

The library attaches itself to `unsafeWindow`, which is the scope WME userscripts run in:

```js
const keys = WMEKeyCodes;
// or, if you prefer being explicit:
const keys = unsafeWindow.WMEKeyCodes;

if (keys) {
  keys.VERSION; // '1.0.1'
}
```

It is UMD-wrapped, so it also works under Node/bundlers (`const WMEKeyCodes = require('./WMEKeyCodes.user.js')`),
which makes it unit-testable outside the browser. The repository filename and the Greasyfork filename
differ (`WMEKeyCodes.user.js` locally, `WME Key Codes.js` when published) — the module name
`WMEKeyCodes` is identical either way.

> `@require` scripts are evaluated **before** your userscript body but their timing relative to WME's
> own bootstrap is not guaranteed — never assume `WMEKeyCodes` and `getWmeSdk()` are both ready in the
> same tick. Gate on the SDK with `unsafeWindow.SDK_INITIALIZED`.

---

## API

### Lookups

| Function | Returns | Example |
|---|---|---|
| `nameFromKeyCode(keyCode)` | canonical name, or the number as a string if unknown; `null` for non-numbers | `nameFromKeyCode(38)` → `'↑'`<br>`nameFromKeyCode(999)` → `'999'` |
| `keyCodeFromName(name)` | keyCode, or `null` | `keyCodeFromName('Up')` → `38`<br>`keyCodeFromName('Ctrl')` → `17` |

Name lookups are **case-insensitive** and ignore spaces, underscores and hyphens, so all of these
resolve identically: `'Up'`, `'up'`, `'UP'`, `'Arrow Up'`.

### Parsing

| Function | Returns | Example |
|---|---|---|
| `parseRaw(value)` | `{ mod, key }` or `null` | `parseRaw('1,38')` → `{ mod: 1, key: 38 }` |
| `parseCombo(value)` | `{ mod, key }` or `null` | `parseCombo('Ctrl+Up')` → `{ mod: 1, key: 38 }` |

`parseCombo()` accepts raw form, readable combos, bare keyCodes and bare key names, which makes it the
safest single entry point when you don't know what you've been handed:

```js
keys.parseCombo('1,38');    // { mod: 1, key: 38 }  (raw passthrough)
keys.parseCombo('C+Up');    // { mod: 1, key: 38 }
keys.parseCombo('Ctrl+Up'); // { mod: 1, key: 38 }
keys.parseCombo('↑');       // { mod: 0, key: 38 }
keys.parseCombo('67');      // { mod: 0, key: 67 }  (2+ digits = keyCode)
keys.parseCombo('8');       // { mod: 0, key: 56 }  (1 digit = the '8' character)
keys.parseCombo('A+82');    // { mod: 4, key: 82 }  (legacy modifier+keyCode)
keys.parseCombo('CS+R');    // { mod: 3, key: 82 }  (combined modifier letters)
keys.parseCombo('garbage'); // null
keys.parseCombo('');        // null
keys.parseCombo('-1');      // null
```

### Converting

| Function | Returns | Example |
|---|---|---|
| `toRaw(value)` | `"mod,keyCode"` or `null` | `toRaw('C+Up')` → `'1,38'` |
| `toCombo(value)` | readable combo or `null` | `toCombo('1,38')` → `'C+↑'` |
| `toNumericCombo(value)` | modifiers + keyCode number, or `null` | `toNumericCombo('1,38')` → `'C+38'` |
| `isResolvableCombo(value)` | `true` when WME's editor parses the string as-is | `isResolvableCombo('C+↑')` → `false` |
| `comboCandidates(value)` | ordered spellings to try with `createShortcut()` | `comboCandidates({ raw: '1,38' })` → `['C+38', 'C+↑', '1,38']` |

All of them accept a string **or** a `{ mod, key }` object, so you can chain them:

```js
const parsed = keys.parseCombo('Ctrl+Shift+R'); // { mod: 3, key: 82 }
keys.toRaw(parsed);                             // '3,82'
keys.toCombo(parsed);                           // 'CS+R'
keys.toNumericCombo(parsed);                    // 'CS+82'
```

### Persistence and comparison

| Function | Returns |
|---|---|
| `normalize(value)` | `{ raw, combo, keys }` |
| `equals(a, b)` | `true` when both mean the same physical shortcut |
| `fromEvent(event)` | `"mod,keyCode"` from a `KeyboardEvent`, or `null` |

`normalize()` accepts a string or an existing record and always yields three fields:

```js
keys.normalize('1,38');
// { raw: '1,38', combo: 'C+↑', keys: '1,38' }

keys.normalize({ raw: '1,38', combo: 'C+↑', keys: '1,38' });
// { raw: '1,38', combo: 'C+↑', keys: '1,38' }
```

| Field | Purpose |
|---|---|
| `raw` | `"mod,keyCode"` — machine form, never localised. Use it for comparison and as the source of the spellings `comboCandidates()` hands to the SDK. |
| `combo` | `"C+↑"` — display and duplicate detection. |
| `keys` | The exact input string, preserved verbatim for lossless round-tripping. |

`equals()` exists because `'C+↑'`, `'Ctrl+Up'` and `'1,38'` are the same shortcut in three costumes:

```js
keys.equals('C+↑', 'Ctrl+Up'); // true
keys.equals('1,38', 'A+82');   // false
```

`fromEvent()` is for capturing a binding in a key-capture dialog:

```js
document.addEventListener('keydown', (e) => {
  const raw = keys.fromEvent(e);
  if (!raw) return;
  e.preventDefault();
  console.log('captured', raw, '→', keys.toCombo(raw)); // '1,38 → C+↑'
}, true);
```

---

## Constants

| Export | Type | Notes |
|---|---|---|
| `VERSION` | `string` | Library version, e.g. `'1.1.1'` |
| `MODIFIER` | frozen object | `{ CTRL: 1, SHIFT: 2, ALT: 4, META: 8 }` — WME's own bit numbering |
| `KEYCODE_TO_NAME` | frozen object | keyCode → canonical name |
| `NAME_TO_KEYCODE` | frozen object | normalised name → keyCode |

Pass a function to `Array.prototype.map` and remember these tables are keyed by number:

```js
Object.entries(keys.KEYCODE_TO_NAME).map(([code, name]) => name + '=' + code).join(' ');
```

---

## Format rules

These are the rules that make the round-trip lossless. They matter because getting them wrong
unbinds shortcuts.

- **Modifier bits:** `Ctrl = 1`, `Shift = 2`, `Alt = 4`. `Meta = 8` is decoded defensively as `M`
  but is never emitted by WME.
- **Emit order** for combos is `C`, `S`, `A`, `M` — so `mod 7` renders as `'ACS+R'`.
- **A bare number of 2+ digits is a keyCode** (`'67'` → `C`). **A single digit is the character**
  (`'8'` → the 8 key, keyCode 56 — *not* Backspace).
- **The same rule applies after a modifier**, which is what makes legacy strings work:
  `'A+82'` → `Alt+R` (`4,82`) and `'C+192'` → ``Ctrl+` `` (`1,192`).
- **Combined modifier letters are accepted**, so anything `toCombo()` emits re-parses:
  `'CS+R'` → `3,82`.
- **Unknown is `null`, never a guess.** An unrecognised modifier or key name returns `null` so the
  caller can decide — do *not* treat `null` as "register the shortcut with no key".
- **Empty markers are `''`, `'-1'`, `'none'`, `'null'`, `'undefined'`** (case-insensitive) and all
  normalise to `null`.
- **Negative keyCodes are invalid** — `'1,-5'` → `null`.

---

## Usage with the WME SDK

### Registering a shortcut

Always replay the **`raw`** form. Handing the SDK a display combo means your binding survives until
the page reloads and then quietly disappears.

```js
keys.normalize(savedValue).combo; // 'C+↑' — display form, but see the gotcha below
```

```js
const record = keys.normalize(getMySavedShortcut('increaseElevation'));

// Try each spelling, keep the first that WME actually binds.
for (const spelling of keys.comboCandidates(record)) {
  try {
    wmeSDK.Shortcuts.createShortcut({
      shortcutId: 'MyScript_IncreaseElevation',
      description: 'Increase elevation',
      callback: () => adjustElevation(1),
      shortcutKeys: spelling,
    });
    break; // registered - press the key to confirm it fires
  } catch (err) {
    if (!String(err).includes('already in use')) throw err;
    break; // taken by WME or another script - leave the saved value alone
  }
}
```

### ⚠️ The `createShortcut()` trap

**Passing the wrong spelling produces a shortcut that is visible but dead.**

WME stores whatever string you hand it and lists the result in
Settings → Keyboard Shortcuts. It resolves exactly two shapes:

| Shape | Example | Binds? |
|---|---|---|
| optional modifier prefix + one character | `"G"`, `"A+R"`, `"CS+R"`, `"C+8"` | ✅ |
| optional modifier prefix + keyCode **number** | `"C+32"` (Ctrl+Space), `"C+38"` (Ctrl+Up) | ✅ |
| modifier prefix + key *name* or glyph | `"C+↑"`, `"S+PageUp"` | ❌ stored, never fires |

`isResolvableCombo()` tells you which column you are in, and `comboCandidates()` already
applies the right order — numeric form first when the readable form carries a key name.

**You cannot detect the failure through the SDK.** A dead binding still passes
`isShortcutRegistered()`, still reports a non-null key from `getAllShortcuts()`, and still
looks correct in the settings UI. Only pressing the key proves it works.

### Reading what someone actually pressed

`Shortcuts.getAllShortcuts()` may hand back either shape depending on version and context, so
normalise before comparing:

```js
const current = wmeSDK.Shortcuts.getAllShortcuts()
  .find((s) => s.shortcutId === 'MyScript_IncreaseElevation');

if (current && keys.equals(current.originalShortcut, stored)) {
  // unchanged — leave the user's binding alone
}
```

### Detecting duplicate bindings

```js
const taken = new Set(
  wmeSDK.Shortcuts.getAllShortcuts()
    .filter((s) => s.shortcutId !== mine)
    .map((s) => keys.toRaw(s.originalShortcut))
    .filter(Boolean)
);

if (taken.has(keys.toRaw(myBinding))) {
  WazeToastr.Alerts.warning('My Script', 'That shortcut is already in use.');
}
```

### Migrating legacy `W.accelerators` settings

This is exactly why the legacy shapes are supported. `A+82` and bare `67` both come from that era:

```js
const legacy = W.accelerators?.['MyScript_IncreaseElevation'];
if (legacy) {
  const record = keys.normalize(legacy);   // handles '67', 'A+82', 'C+↑', '1,38'
  if (record.raw) saveMyShortcut('increaseElevation', record.raw);
}
```

---

## Key reference

Captured from `KEYCODE_TO_NAME`. Punctuation is US layout; the numbers are the legacy
`KeyboardEvent.keyCode` values WME stores.

```
Backspace 8    Tab 9        Enter 13    Esc 27      Space 32
PageUp 33      PageDown 34  End 35      Home 36
← 37           ↑ 38         → 39        ↓ 40
Insert 45      Delete 46
Shift 16       Ctrl 17      Alt 18      Pause 19    CapsLock 20
PrintScreen 44 MetaLeft 91  MetaRight 92 ContextMenu 93
NumLock 144    ScrollLock 145

0-9   48-57          A-Z      65-90
F1-F24 112-135       Num0-9   96-105
Num* 106  Num+ 107   NumEnter 108  Num- 109  Num. 110  Num/ 111  Num, 194

; 186   = 187   , 188   - 189   . 190   / 191   ` 192
[ 219   \ 220   ] 221   ' 222   <> 226

Mute 173  VolumeDown 174  VolumeUp 175  MediaNext 176
MediaPrev 177  MediaStop 178  MediaPlayPause 179
```

### Accepted aliases

Name lookups accept friendly spellings so callers don't have to know the canonical name:

| Group | Aliases |
|---|---|
| Arrows | `Up`, `Down`, `Left`, `Right`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` |
| Navigation | `PageUp`, `PageDown`, `PgUp`, `PgDn`, `Del`, `Delete`, `Ins`, `Insert`, `Esc`, `Escape` |
| Whitespace | `Return`, `Enter`, `Space`, `Spacebar` |
| Locks | `Caps`, `CapsLock`, `PrtSc`, `PrtScr`, `PrintScreen` |
| Modifiers | `Shift`, `Ctrl`, `Control`, `Alt`, `Option`, `Meta`, `Win`, `Windows`, `Cmd`, `Command`, `Super` |
| Punctuation | `Semicolon`, `Equal`, `Equals`, `Plus`, `Comma`, `Minus`, `Hyphen`, `Dash`, `Period`, `Dot`, `Slash`, `ForwardSlash`, `Backtick`, `Grave`, `Tilde`, `OpenBracket`, `LeftBracket`, `Backslash`, `CloseBracket`, `RightBracket`, `Quote`, `Apostrophe` |

> The alias lookup normalises case and separators, not word order — `'Arrow Up'` and `'arrowup'`
> both work, but `'Up Arrow'` does not. Use the canonical order.

---

## Notes and gotchas

- **`keyCode` is deprecated** in the DOM. It is used here because WME stores and reports shortcuts in
  that legacy numbering — not because it's a good idea in new code.
- **Left/right modifiers are indistinguishable.** `ShiftLeft` and `ShiftRight` are both keyCode 16.
  WME's `"modifierMask,keyCode"` format has no room for `event.location`, so a binding cannot express
  "left Ctrl only".
- **Arrow keys use the glyph as their canonical name** (`↑`/`↓`/`←`/`→`) so combos saved by earlier
  scripts keep round-tripping. The word aliases are accepted on input but `toCombo()` always emits
  the glyph.
- **`KEYCODE_TO_NAME[192]` is `` ` ``** (backquote), deliberately. An empty-string entry here would
  make `toCombo('1,192')` render as `'C+'` and break the round-trip.
- **Media keys (173-179) are browser-dependent** and may never arrive as those keyCodes in practice;
  they are included for completeness.
- **`normalize()` never throws** — malformed input yields `{ raw: null, combo: null, keys: <input or null> }`.

---

## License

GNU General Public License v3.0 (GPL-3.0).

## Author

[kid4rm90s](https://greasyfork.org/en/users/1087400-kid4rm90s)
