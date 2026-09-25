// Minimal xlsx text dumper: prints every sheet as plain text rows.
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
const readXml = (p) => fs.readFileSync(path.join(dir, p), "utf8");
const decodeEntities = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
   .replace(/&amp;/g, "&");

// shared strings
const shared = [];
{
  const xml = readXml("xl/sharedStrings.xml");
  const siRe = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x => x[1]);
    shared.push(decodeEntities(texts.join("")));
  }
}

// sheet order from workbook.xml + rels
const wbXml = readXml("xl/workbook.xml");
const relsXml = readXml("xl/_rels/workbook.xml.rels");
const rels = {};
for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
  const tag = m[0];
  const id = tag.match(/\bId="([^"]+)"/);
  const target = tag.match(/\bTarget="([^"]+)"/);
  if (id && target) rels[id[1]] = target[1].replace(/^\//, "");
}
const sheets = [];
for (const m of wbXml.matchAll(/<(?:\w+:)?sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
  sheets.push({ name: m[1], file: rels[m[2]] });
}

const cellValue = (cellXml) => {
  const tMatch = cellXml.match(/<(?:\w+:)?c[^>]*\st="([^"]+)"/);
  const type = tMatch ? tMatch[1] : null;
  if (type === "inlineStr") {
    const texts = [...cellXml.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x => x[1]);
    return decodeEntities(texts.join(""));
  }
  const v = cellXml.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
  if (!v) return "";
  const raw = v[1];
  if (type === "s") return shared[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return decodeEntities(raw);
};

for (const sheet of sheets) {
  console.log(`\n===== SHEET: ${sheet.name} =====`);
  const xml = readXml(sheet.file);
  const rows = xml.match(/<(?:\w+:)?row[^>]*>[\s\S]*?<\/(?:\w+:)?row>/g) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<(?:\w+:)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g)].map(m => cellValue(m[0]));
    const line = cells.map(c => c.replace(/\s+/g, " ").trim()).join(" | ").replace(/(\s*\|\s*)+$/, "");
    if (line.trim()) console.log(line);
  }
}
