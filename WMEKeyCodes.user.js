// ==UserScript==
// @name         WME Key Codes
// @namespace    https://greasyfork.org/users/1087400
// @version      1.0.1
// @description  Shared keyCode <-> key-name <-> shortcut-string mapping for WME userscripts. Understands the WME SDK's raw "modifierMask,keyCode" form and the readable "C+Up" form, plus Ctrl/Shift/Alt spellings. Usable via @require.
// @author       https://greasyfork.org/en/users/1087400-kid4rm90s
// @license      GNU GPL(v3)
// ==/UserScript==

/**
 * WME Key Codes — one shared source of truth for keyboard mapping.
 *
 * Why: WME stores shortcuts as "modifierMask,keyCode" (e.g. "1,38" = Ctrl+Up) but the
 * SDK also reports/accepts readable combos (e.g. "C+Up"). Every script re-implementing
 * that table risks losing a key it does not recognise — which silently unbinds the
 * shortcut. This module keeps the round-trip lossless and identical across scripts.
 *
 * Usage (from another userscript):
 *   // @require https://update.greasyfork.org/scripts/597539/WME%20Key%20Codes.js
 *   const keys = WMEKeyCodes;                       // or unsafeWindow.WMEKeyCodes
 *   keys.keyCodeFromName('Up');                     // 38
 *   keys.nameFromKeyCode(38);                       // '↑'
 *   keys.toRaw('C+Up');                             // '1,38'
 *   keys.toCombo('1,38');                           // 'C+↑'
 *   keys.normalize('1,38');                         // { raw, combo, keys }
 *   keys.fromEvent(keydownEvent);                   // '1,38'
 *   keys.equals('C+↑', 'Ctrl+Up');                  // true
 *
 * Format notes
 *   - Modifier mask bits: Ctrl=1, Shift=2, Alt=4 (WME's own numbering). Meta=8 is
 *     decoded defensively as "M" but is not emitted by WME itself.
 *   - A bare 2+ digit number is a raw keyCode ("67" -> C). A single digit is the
 *     character ("8" -> the 8 key, keyCode 56). The same rule applies after a
 *     modifier, so "A+82" means Alt+R (legacy W.accelerators form) and
 *     "C+192" means Ctrl+` (a keyCode with no friendly name).
 *   - Combined modifier letters are accepted ("CS+R" = Ctrl+Shift+R,
 *     "ACS" = Ctrl+Shift+Alt) so combos emitted by toCombo() re-parse cleanly.
 *   - Arrow keys use the glyph as their canonical name ("↑"/"↓"/"←"/"→") so existing
 *     saved combos keep round-tripping; Up/Down/Left/Right/ArrowUp/... are aliases.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(); // Node / bundlers
  } else {
    root.WMEKeyCodes = factory(); // Tampermonkey / browser (shared via unsafeWindow)
  }
})(
  typeof unsafeWindow !== 'undefined' ? unsafeWindow
    : (typeof window !== 'undefined' ? window : globalThis),
  function () {
    'use strict';

    // ---------------------------------------------------------------------
    // keyCode -> canonical name (values are the legacy KeyboardEvent.keyCode
    // numbers WME uses in its stored shortcut strings).
    // ---------------------------------------------------------------------
    const KEYCODE_TO_NAME = {};

    // Letters A-Z (65-90)
    for (let i = 0; i < 26; i++) KEYCODE_TO_NAME[65 + i] = String.fromCharCode(65 + i);
    // Top-row digits 0-9 (48-57)
    for (let i = 0; i < 10; i++) KEYCODE_TO_NAME[48 + i] = String(i);
    // Function keys F1-F24 (112-135)
    for (let i = 0; i < 24; i++) KEYCODE_TO_NAME[112 + i] = 'F' + (i + 1);
    // Numpad digits (96-105)
    for (let i = 0; i < 10; i++) KEYCODE_TO_NAME[96 + i] = 'Num' + i;

    Object.assign(KEYCODE_TO_NAME, {
      // Control & whitespace
      8: 'Backspace', 9: 'Tab', 13: 'Enter', 27: 'Esc', 32: 'Space',
      // Navigation / editing
      33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home',
      37: '\u2190', 38: '\u2191', 39: '\u2192', 40: '\u2193',
      45: 'Insert', 46: 'Delete',
      // System / locks
      16: 'Shift', 17: 'Ctrl', 18: 'Alt', 19: 'Pause', 20: 'CapsLock',
      44: 'PrintScreen', 91: 'MetaLeft', 92: 'MetaRight', 93: 'ContextMenu',
      144: 'NumLock', 145: 'ScrollLock',
      // Numpad operators
      106: 'NumMultiply', 107: 'NumAdd', 108: 'NumEnter',
      109: 'NumSubtract', 110: 'NumDecimal', 111: 'NumDivide', 194: 'NumComma',
      // Punctuation (US layout)
      186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
      219: '[', 220: '\\', 221: ']', 222: "'", 226: '<>',
      // Media keys (browser-dependent, best effort)
      173: 'Mute', 174: 'VolumeDown', 175: 'VolumeUp', 176: 'MediaNext',
      177: 'MediaPrev', 178: 'MediaStop', 179: 'MediaPlayPause',
    });

    // ---------------------------------------------------------------------
    // name -> keyCode (built from the table above, plus tolerant aliases)
    // ---------------------------------------------------------------------
    const NAME_TO_KEYCODE = {};

    const addName = (name, code) => {
      const normalised = String(name).toUpperCase().replace(/[\s_-]/g, '');
      if (normalised) NAME_TO_KEYCODE[normalised] = code;
    };

    Object.keys(KEYCODE_TO_NAME).forEach((code) => {
      const name = KEYCODE_TO_NAME[code];
      if (name) addName(name, Number(code));
    });

    const ALIASES = {
      // Arrows
      UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
      ARROWUP: 38, ARROWDOWN: 40, ARROWLEFT: 37, ARROWRIGHT: 39,
      // Navigation / editing
      PAGEUP: 33, PAGEDOWN: 34, PGUP: 33, PGDN: 34,
      DEL: 46, DELETE: 46, INS: 45, INSERT: 45, ESC: 27, ESCAPE: 27,
      RETURN: 13, ENTER: 13,
      SPACE: 32, SPACEBAR: 32, SPACEBARKEY: 32,
      CAPS: 20, CAPSLOCK: 20, PRTSC: 44, PRTSCR: 44, PRINTSCREEN: 44,
      // Modifier keys as keys
      SHIFT: 16, CTRL: 17, CONTROL: 17, ALT: 18, OPTION: 18,
      META: 91, WIN: 91, WINDOWS: 91, CMD: 91, COMMAND: 91, SUPER: 91,
      // Punctuation
      SEMICOLON: 186, EQUAL: 187, EQUALS: 187, PLUS: 187,
      COMMA: 188, MINUS: 189, HYPHEN: 189, DASH: 189,
      PERIOD: 190, DOT: 190, SLASH: 191, FORWARDSLASH: 191,
      BACKTICK: 192, GRAVE: 192, TILDE: 192,
      OPENBRACKET: 219, LEFTBRACKET: 219,
      BACKSLASH: 220,
      CLOSEBRACKET: 221, RIGHTBRACKET: 221,
      QUOTE: 222, APOSTROPHE: 222,
    };
    Object.keys(ALIASES).forEach((name) => addName(name, ALIASES[name]));

    Object.freeze(KEYCODE_TO_NAME);
    Object.freeze(NAME_TO_KEYCODE);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------
    const MODIFIER = Object.freeze({ CTRL: 1, SHIFT: 2, ALT: 4, META: 8 });

    // Tokens accepted in the modifier position of a readable combo.
    const MODIFIER_TOKENS = Object.freeze({
      C: 1, CTRL: 1, CONTROL: 1,
      S: 2, SHIFT: 2,
      A: 4, ALT: 4, OPTION: 4,
      M: 8, META: 8, CMD: 8, COMMAND: 8, WIN: 8, SUPER: 8,
    });

    // Modifier lookup that also accepts the compact combined forms toCombo()
    // emits for multi-modifier shortcuts ("CS" = Ctrl+Shift, "ACS" = all three).
    const modifierBits = (token) => {
      if (!token) return 0;
      const direct = MODIFIER_TOKENS[token];
      if (direct !== undefined) return direct;
      if (/^[CSAM]+$/.test(token)) {
        let bits = 0;
        for (let i = 0; i < token.length; i++) {
          const bit = MODIFIER_TOKENS[token[i]];
          if (bit === undefined) return 0;
          bits |= bit;
        }
        return bits;
      }
      return 0;
    };

    // Emit order when building a readable combo.
    const MODIFIER_LETTERS = [[1, 'C'], [2, 'S'], [4, 'A'], [8, 'M']];

    // Strings that mean "no key assigned".
    const EMPTY_VALUES = new Set(['', '-1', 'none', 'null', 'undefined']);

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    /** keyCode -> canonical name, or the numeric string when unknown. */
    function nameFromKeyCode(keyCode) {
      if (typeof keyCode !== 'number' || !Number.isFinite(keyCode)) return null;
      return KEYCODE_TO_NAME[keyCode] !== undefined ? KEYCODE_TO_NAME[keyCode] : String(keyCode);
    }

    /** Key name (or alias) -> keyCode, or null when unrecognised. */
    function keyCodeFromName(name) {
      if (name === null || name === undefined) return null;
      const normalised = String(name).toUpperCase().replace(/[\s_-]/g, '');
      if (!normalised) return null;
      const code = NAME_TO_KEYCODE[normalised];
      return typeof code === 'number' ? code : null;
    }

    /** "1,38" -> { mod: 1, key: 38 }, or null. */
    function parseRaw(value) {
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      if (EMPTY_VALUES.has(text.toLowerCase())) return null;
      const match = text.match(/^(\d+)\s*,\s*(-?\d+)$/);
      if (!match) return null;
      const mod = parseInt(match[1], 10);
      const key = parseInt(match[2], 10);
      if (!Number.isFinite(mod) || !Number.isFinite(key) || key < 0) return null;
      return { mod: mod, key: key };
    }

    /** Readable combo ("C+Up", "Ctrl+↑"), bare name ("Up") or raw -> { mod, key }, or null. */
    function parseCombo(value) {
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      if (EMPTY_VALUES.has(text.toLowerCase())) return null;

      const raw = parseRaw(text);
      if (raw) return raw;

      // Legacy bare key code: two or more digits (a single digit is the character).
      if (/^\d{2,}$/.test(text)) return { mod: 0, key: parseInt(text, 10) };

      const tokens = text.split('+').map((token) => token.trim()).filter(Boolean);
      if (tokens.length === 0) return null;

      const keyToken = tokens.pop();
      let mod = 0;
      for (let i = 0; i < tokens.length; i++) {
        const normalised = tokens[i].toUpperCase().replace(/[\s_-]/g, '');
        const bit = modifierBits(normalised);
        if (bit === 0) return null; // unknown modifier -> not a combo we understand
        mod |= bit;
      }

      // The key may be a name ("R", "Up") or a numeric keyCode ("82", "192"):
      // the legacy W.accelerators form is always modifier+keyCode ("A+82") and
      // toCombo() emits a bare number for keyCodes with no friendly name.
      // Only 2+ digit tokens are keyCodes — a single digit is the character
      // ("C+8" is Ctrl+8 = 1,56, not Ctrl+Backspace = 1,8).
      const key = /^\d{2,}$/.test(keyToken)
        ? parseInt(keyToken, 10)
        : keyCodeFromName(keyToken);
      if (key === null || !Number.isFinite(key)) return null;
      return { mod: mod, key: key };
    }

    /** Anything we understand -> "mod,keyCode" (the form to replay into the SDK). */
    function toRaw(value) {
      const parsed = value !== null && typeof value === 'object' && typeof value.key === 'number'
        ? value
        : (parseRaw(value) || parseCombo(value));
      return parsed ? parsed.mod + ',' + parsed.key : null;
    }

    /** Anything we understand -> readable combo ("C+↑"). */
    function toCombo(value) {
      const parsed = value !== null && typeof value === 'object' && typeof value.key === 'number'
        ? value
        : (parseCombo(value) || parseRaw(value));
      if (!parsed) return null;
      let letters = '';
      MODIFIER_LETTERS.forEach((pair) => {
        if (parsed.mod & pair[0]) letters += pair[1];
      });
      return (letters ? letters + '+' : '') + nameFromKeyCode(parsed.key);
    }

    /**
     * Canonical persistence record used by shortcut storage.
     *   raw   "mod,keyCode" — machine form, prefer when replaying into the SDK
     *   combo "C+↑"         — human form, used for duplicate detection/display
     *   keys                — the exact input string, preserved for lossless replay
     */
    function normalize(value) {
      const isObject = value !== null && typeof value === 'object';
      const source = isObject ? (value.raw ?? value.combo ?? value.keys) : value;
      const raw = toRaw(source);
      const combo = toCombo(raw);
      const keys = isObject && typeof value.keys === 'string' && value.keys
        ? value.keys
        : (typeof source === 'string' && source ? source : null);
      return { raw: raw, combo: combo, keys: keys };
    }

    /** True when two representations mean the same physical shortcut. */
    function equals(a, b) {
      const rawA = toRaw(a);
      return rawA !== null && rawA === toRaw(b);
    }

    /** KeyboardEvent (or {keyCode, ctrlKey, shiftKey, altKey, metaKey}) -> "mod,keyCode". */
    function fromEvent(event) {
      if (!event || typeof event.keyCode !== 'number') return null;
      let mod = 0;
      if (event.ctrlKey) mod |= MODIFIER.CTRL;
      if (event.shiftKey) mod |= MODIFIER.SHIFT;
      if (event.altKey) mod |= MODIFIER.ALT;
      if (event.metaKey) mod |= MODIFIER.META;
      return mod + ',' + event.keyCode;
    }

    return {
      VERSION: '1.0.1',
      MODIFIER: MODIFIER,
      KEYCODE_TO_NAME: KEYCODE_TO_NAME,
      NAME_TO_KEYCODE: NAME_TO_KEYCODE,
      nameFromKeyCode: nameFromKeyCode,
      keyCodeFromName: keyCodeFromName,
      parseRaw: parseRaw,
      parseCombo: parseCombo,
      toRaw: toRaw,
      toCombo: toCombo,
      normalize: normalize,
      equals: equals,
      fromEvent: fromEvent,
    };
  }
);