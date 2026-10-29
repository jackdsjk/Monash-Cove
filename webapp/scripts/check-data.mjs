import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../../local-service/fixtures/items.json", import.meta.url), "utf8"));
const required = ["id", "source", "title", "text", "evidenceQuote", "contentType", "importance", "actionRequired", "openOriginal"];
const sources = new Set(["gmail", "ed", "moodle"]);

assert.equal(data.items.length, 55, "expected 55 anonymized items");
assert.equal(new Set(data.items.map((item) => item.id)).size, 55, "item ids must be unique");

for (const item of data.items) {
  for (const field of required) assert.ok(item[field], `${item.id} is missing ${field}`);
  assert.ok(sources.has(item.source), `${item.id} has an unknown source`);
  assert.ok(item.text.includes(item.evidenceQuote), `${item.id} evidence quote must be a substring`);
  assert.ok(Number.isFinite(item.ageHours) && item.ageHours >= 0, `${item.id} has an invalid age`);
}

assert.equal(data.items.filter((item) => item.source === "gmail").length, 25);
assert.equal(data.items.filter((item) => item.source === "ed").length, 25);
assert.equal(data.items.filter((item) => item.source === "moodle").length, 5);

console.log("webapp data checks passed");
