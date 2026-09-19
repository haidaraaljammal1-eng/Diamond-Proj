# Product

## Register

product

## Users

Diamond has two audiences on two separate surfaces.

**Office staff (primary).** Owner, managers and employees of Diamond Rent Car in Dubai, working at the office desk on a laptop or desktop monitor. They run the whole rental lifecycle from one protected app shell: fleet and pricing, contracts (`AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED`), Car-Out and Car-In evidence (mileage, fuel, damage, signature, eight required photos), reconciliation and close, finance, maintenance, violations and Salik, GPS, WhatsApp, users and roles. Access is permission-driven; the Backend is the authority and the UI only hides what a role cannot do. Their job: move each contract to its next state correctly, with complete legal and photographic evidence, without re-typing what the system already knows.

**Customers (secondary, public).** Renters who receive a tokenised link and open it on their own phone, no login and no app shell. They upload driving license and passport, review and sign the official A4 contract, pay, and later use return or renewal links. Their job: finish a legally binding rental quickly and feel they are dealing with a premium, trustworthy office.

Both surfaces are Arabic RTL by default with full English LTR.

## Product Purpose

Diamond is the internal operating system of one luxury car rental office in Dubai (RENT CAR · DUBAI), not a marketplace or a marketing site. It replaces paper, spreadsheets and chat threads with one persisted workflow where every contract, handover, payment and charge has a single source of truth and a clear next action.

Success looks like: staff always know what state a contract is in and what to do next; no contract reaches Car-Out without signature, payment and evidence; customers complete the public journey on a phone without calling the office; and the tool feels as considered as the cars it rents.

## Brand Personality

**Discreet, precise, hospitable.**

The voice of a luxury hotel concierge. Quiet confidence, never loud. Gold is a hairline and a signature, not a flood. Every label is exact (the legal and financial states matter), and copy is courteous without being chatty. Luxury is expressed through restraint, craft and correctness: warm ivory surfaces, champagne and gold accents, careful typography, calm motion. Staff should feel in control; customers should feel looked after.

## Anti-references

- **Generic SaaS admin templates.** Bootstrap or Material dashboards, default blue primary buttons, flat gray tables, stock icon sets, hero-metric KPI cards with gradient accents, identical card grids. If a screen could belong to any CRM, it is wrong for Diamond.
- By extension: default OS form controls (native `<select>`, native date inputs) that paint outside the brand and break RTL.

## Design Principles

1. **State is the interface.** Every screen answers "where is this contract, and what is the next legitimate action?" Show the lifecycle status, the one permitted next step, and what blocks it. Never offer an action the Backend would refuse; never infer a state from a redirect or local UI.
2. **Restraint is the luxury.** Premium comes from precision and calm, not ornament. One accent used with intent, hairline gold, generous but deliberate spacing. When in doubt, remove.
3. **Arabic first, both directions equal.** Design in RTL first, then verify LTR. Direction is set once on `<html>`; components use logical properties only. Numbers, plates, VINs, contract numbers and amounts stay LTR-isolated inside Arabic text. A layout that only works in one direction is broken.
4. **One shared vocabulary.** The system has one of each control and features compose it:
   - One shared Diamond `Select` for every dropdown in the system. The native `<select>` is banned everywhere.
   - Icons come only from `@iconify/react` through the shared `Icon` component. No emoji in UI or translation strings, no ad-hoc inline SVG in feature code.
   - Shared `Card`, `Chip`, `Dialog`, `Drawer`, `DateRangePicker`, `Switch` and form fields are reused, never re-styled per page.
5. **Nothing ships undocumented.** Every change gets a `DOCU/CHANGELOG.md` entry and its page or flow documented under `DOCU/`, proportional to its size. A new session must be able to understand what exists from `DOCU/` alone.

## Accessibility & Inclusion

- Target **WCAG 2.2 AA** on both staff and public surfaces.
- Contrast: gold and champagne on ivory frequently fail AA for text. Gold is for accents, borders and large display text; body and label text uses the dark ink tokens. Verify every new text/background pair.
- Status is never color-only: contract and integration chips pair color with a label (and icon where useful).
- Full keyboard operation for staff flows (tables, drawers, dialogs, the shared Select), visible focus, focus returned on close.
- Respect `prefers-reduced-motion`; motion is calm and never required to understand state.
- Public customer pages are mobile-first (375 / 390 / 430 widths) with comfortable touch targets, since customers complete legal and payment steps on their own phones.
- Bilingual parity: every string exists in both `ar` and `en`; no raw translation keys ever reach the user.
