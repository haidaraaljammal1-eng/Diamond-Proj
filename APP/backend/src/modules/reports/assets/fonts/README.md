# Bundled report fonts

`IBMPlexSansArabic-Regular.ttf` and `IBMPlexSansArabic-SemiBold.ttf` are used by the
server-side PDF renderer (`report-pdf.ts`) to embed an Arabic-capable font so that
report PDFs render Arabic (shaping + RTL) and mixed Arabic/Latin content correctly.

- **Family:** IBM Plex Sans Arabic (covers Arabic + Latin + digits in one family).
- **License:** SIL Open Font License 1.1 — see `OFL.txt`. The OFL permits embedding
  the font in documents (including generated PDFs) and bundling it with the application.
- These files are **bundled/deployed with the app** and embedded into the PDF. They are
  never exposed through any route or served to end users directly.

Do not replace with a non-OFL/system font: production must not depend on a font that may
be absent, and only an embeddable, licensed font may be shipped.
