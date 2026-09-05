---
name: diamond-select
description: Use whenever a dropdown, select, combobox, picker, lookup field, filter chooser, or "قائمة منسدلة / سيليكت / اختيار" is added or changed in the Diamond frontend. Enforces the shared Diamond Select (brand identity) instead of a native <select> and shows the exact usage for forms, lookups, and shell chrome.
---

# Diamond Select

## Rule

Never write a native `<select>` / `<option>` in `APP/frontend`. Every dropdown
uses the shared Diamond Select, which carries the Pearl Ivory + champagne-gold
identity, works in RTL and LTR, and is portalled so nothing clips it.

- Component: `src/shared/components/ui/select` (`Select`, `SelectOption`)
- Form binding: `src/shared/components/forms/fields/select-field.tsx`
- FormBuilder: field `type: "select"`
- Docs: `DOCU/00-system-overview/ui-select.md`

If a dropdown already exists as a native `<select>`, replace it.

## Pick the shape

| Situation | What to write |
| --- | --- |
| Field inside a FormBuilder config | `{ type: "select", name, options, placeholder?, searchable?, clearable? }` |
| Field inside a hand-written RHF form | `<SelectField name=… options=… />` |
| Not a form (filter bar, toolbar, shell chrome) | `<Select variant="ghost" size="sm" … />` |
| Long list / backend lookup | add `searchable` |
| Optional value | add `clearable` |

## Usage

```tsx
import { Select, type SelectOption } from "@/shared/components/ui/select";

const OPTIONS: SelectOption[] = [
  { value: "gclass", label: t("cars.gclass"), hint: "SUV · 2024" },
  { value: "sold", label: t("cars.lx600"), disabled: true },
];

<Select
  options={OPTIONS}
  value={value}
  onChange={setValue}
  placeholder={t("chooseCar")}
  searchable
/>;
```

FormBuilder:

```ts
const fields: FormField<ContractForm>[] = [
  { type: "select", name: "carId", options: carOptions, searchable: true },
];
```

## Non-negotiables

- **Labels arrive translated.** The component never receives a raw i18n key.
  Lookup hooks translate before building `SelectOption[]`.
- **Internal strings** (`placeholder`, `searchPlaceholder`, `noResults`,
  `clear`) live in the `Select` namespace of `messages/ar.json` and
  `messages/en.json` — keep both files structurally aligned.
- **Lookups go through a domain hook**, never a direct API/store call from the
  component (see the root `AGENTS.md`).
- **Do not restyle it per feature.** Need a new look? Add a variant to
  `select.module.css` using `tokens.css` variables — no hardcoded hex outside
  the token file, no local copy of the panel.
- **Do not install a dropdown library.** The frontend has no Radix/Headless UI
  and does not need one.

## Extending

New behavior (multi-select, grouped options, async loading) is added to the
shared component with a prop plus a token-driven style, and documented in
`DOCU/00-system-overview/ui-select.md`. Never fork the component into a feature
folder.
