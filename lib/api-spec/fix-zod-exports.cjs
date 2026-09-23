const fs = require("node:fs");
const path = require("node:path");

// Orval appends this wildcard to the handwritten public index on each run.
// Its GetCardPricesParams type conflicts with the schema of the same name.
const file = path.join(__dirname, "../api-zod/src/index.ts");
const original = fs.readFileSync(file, "utf8");
const cleaned = original.replace(/^export \* from ['"]\.\/generated\/types['"];?\r?\n?/gm, "");
fs.writeFileSync(file, cleaned);