# Diamond Select (Shared Dropdown)

## Rule

Any dropdown in Diamond uses the shared `Select`
(`src/shared/components/ui/select`). A native `<select>` is not used anywhere
in the system: its popup is painted by the operating system, so it cannot carry
the Pearl Ivory / champagne-gold identity and breaks RTL and dark-highlight
behavior on Windows.

Inside a form, the Select is never used directly — use `SelectField`
(`src/shared/components/forms/fields/select-field.tsx`) or the FormBuilder field
type `select`.

## Anatomy

| Part    | Identity |
| ------- | -------- |
| Trigger | `field` variant mirrors the shared Input: gold hairline underline, gold wash on focus. `ghost` variant mirrors the topbar chips: champagne capsule, radius 9px. |
| Caret   | Physical rotation on purpose — a caret always points down and never mirrors in RTL. Rotates 180° while the panel is open. |
| Panel   | Body portal, fixed position, pearl glass surface, gold hairline border, `--diamond-shadow`-family glow, 14px radius, flips above the trigger when the viewport has no room below. |
| Option  | 10px radius row, gold-wash highlight on the active row, gold-gradient **diamond rhombus** marker on the selected row. |
| Empty   | Translated `Select.noResults`. |

The panel is portalled to `document.body` so no scrolling ancestor (topbar,
table, dialog) clips it and no local `z-index` fights it.

## API

```tsx
<Select
  options={options}          // readonly SelectOption[] — labels already translated
  value={value}              // string | null
  onChange={setValue}
  onBlur={field.onBlur}      // React Hook Form blur
  placeholder="اختر السيارة" // defaults to the translated Select.placeholder
  variant="field"            // "field" (forms) | "ghost" (shell chrome)
  size="md"                  // "md" 46px | "sm" 36px
  icon={<GlobeIcon />}       // optional leading glyph
  searchable                 // in-panel filter — use for lookups
  clearable                  // reset control
  disabled
  invalid                    // wired automatically by SelectField
  name="carId"               // optional hidden input for plain HTML forms
/>
```

`SelectOption` carries `value`, `label`, optional `hint` (secondary line),
`icon`, and `disabled`.

## Variants in use

- **Form field** — `variant="field"`, through `SelectField` / FormBuilder.
- **Shell chrome** — `variant="ghost" size="sm"`, e.g. the AppHeader locale
  switcher.

## Accessibility

`role="combobox"` trigger with `aria-haspopup`, `aria-expanded`,
`aria-controls`, and `aria-activedescendant`; `role="listbox"` panel with
`role="option"` rows and `aria-selected`. Keyboard: Arrow Up/Down (wrapping,
skips disabled), Home/End, Enter/Space to commit, Escape to close and return
focus to the trigger, Tab to close and blur, and single-key typeahead when the
select is not searchable. Outside pointer-down closes and fires `onBlur`.

## i18n

Internal strings live in the `Select` namespace of `messages/ar.json` and
`messages/en.json`: `placeholder`, `searchPlaceholder`, `noResults`, `clear`.
Option labels are always passed in already translated — the component never
renders a raw key.

## Related

- [Frontend UI Architecture](./frontend-ui-architecture.md)
- [i18n Architecture](./i18n-architecture.md)
