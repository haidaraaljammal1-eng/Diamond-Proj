import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

function readSource(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("DataSearch markup", () => {
  const source = readSource("data-search.tsx");
  const types = readSource("data-search.types.ts");

  it("defaults to a form wrapper with submit Search and unchanged Enter-via-form behavior", () => {
    assert.match(types, /embedded\?:\s*boolean/);
    assert.match(source, /embedded = false/);
    assert.match(source, /<form/);
    assert.match(source, /type=\{embedded \? "button" : "submit"\}/);
    assert.match(
      source,
      /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\);\s*submitSearch\(\);/,
    );
  });

  it("renders a non-form wrapper in embedded mode", () => {
    assert.match(source, /if \(embedded\) \{/);
    assert.match(source, /<div className=\{classNames\} data-testid="data-search">/);
    assert.doesNotMatch(source, /<form[\s\S]*embedded/);
  });

  it("runs search on the button and on Enter without submitting a parent form", () => {
    assert.match(source, /onClick=\{embedded \? submitSearch : undefined\}/);
    assert.match(source, /function handleEmbeddedKeyDown/);
    assert.match(source, /if \(event\.key !== "Enter"\) return;/);
    assert.match(source, /event\.preventDefault\(\);\s*submitSearch\(\);/);
    assert.match(source, /onKeyDown=\{embedded \? handleEmbeddedKeyDown : undefined\}/);
  });
});
