# Diamond Frontend — Agent Rules

## RTL / LTR direction

`dir` is set once, on `<html>`, in `src/app/[locale]/layout.tsx`
(`ar` → `rtl`, `en` → `ltr`). `next-intl` does not flip anything by itself.
Every direction bug in this app so far has been a CSS bug, not an i18n bug.

**Rules:**

1. Use logical properties, never physical ones:
   `inset-inline-*` / `margin-inline-*` / `padding-inline-*` /
   `border-inline-*`, and `text-align: start | end` — never `left` / `right`.
   Exceptions must carry a comment saying why (see `.langCaret`: a dropdown
   caret always points down, so it stays physical).
2. `transform: translateX()` is **always physical** — it does not flip with
   `dir`. Any slide-in/out needs a `:global([dir="ltr"])` counterpart, as the
   mobile rail drawer does in `sidebar/sidebar.module.css`.
3. **The shell dock edge lives in exactly one file.** The rail is docked to the
   inline-start edge and the main content reserves the same edge. Both read
   `--rail-inset-start` / `--rail-inset-end` / `--main-inset-start` /
   `--main-inset-end` from `app-shell.module.css`. Do **not** write
   `inset-inline-start` / `inset-inline-end` values on `.rail` in
   `sidebar/sidebar.module.css` or on `.main` in `content/app-content.module.css`.
   Writing them separately is what put the rail on one edge while the content
   reserved the other — an empty gutter on one side, the rail overlapping the
   content on the other. It has regressed twice.
4. Directional SVG glyphs (panel/chevron/arrow icons) mirror with
   `:global([dir="rtl"]) { transform: scaleX(-1) }`, not with a second icon.
5. Directional box-shadow offsets (`30px 0 ...`) break in one of the two
   directions. Use a symmetric shadow or a per-`dir` rule.

## backdrop-filter

Write `-webkit-backdrop-filter` **before** the unprefixed `backdrop-filter`.
The CSS pipeline keeps only one of the pair, and with the unprefixed property
first it is the one dropped — the glass effect then silently disappears in
Chrome. It had already been lost on the shell header and the rail this way.
Verify with `getComputedStyle(el).backdropFilter` in the browser, not by
reading the source.

**Check before claiming a direction fix is done:** open both `/ar` and `/en`
and confirm the rail and the content sit on the *same* edge, with no gap on the
opposite edge.

@AGENTS.md
