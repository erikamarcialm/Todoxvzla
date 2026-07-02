/**
 * migrate-to-sheets.js
 * --------------------
 * Convierte data.js a dos CSVs listos para importar a Google Sheets:
 *   - resources.csv  → pegar en la hoja "resources"
 *   - sources.csv    → pegar en la hoja "sources"
 *
 * Uso:
 *   node migrate-to-sheets.js
 */

// Inlinea el contenido de data.js
const fs = require("fs");
const path = require("path");

// Cargar data.js como módulo (ejecutándolo en un contexto con las variables)
const dataCode = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
const fn = new Function(dataCode + "; return { SITE_DATA, LAST_UPDATED };");
const { SITE_DATA, LAST_UPDATED } = fn();

const CAT_IDS = [
  "cat-desaparecidos", "cat-hospitales", "cat-mascotas-desaparecidas",
  "cat-insumos", "cat-danos", "cat-oficios", "cat-traductores",
  "cat-salud", "cat-mascotas-apoyo", "cat-donaciones",
];

function esc(v) {
  if (!v) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── resources.csv ──────────────────────────────────────────────────────────
const resHeaders = [
  "title", "url", "desc", "type", "status", "tag", "note", "subgroup",
  ...CAT_IDS,
];

const resRows = [resHeaders.join(",")];

SITE_DATA.categories.forEach(cat => {
  // Recursos propios de cada categoría
  const ownResources = [];
  if (cat.resources) ownResources.push(...cat.resources.map(r => ({ ...r, _subgroup: null, _ownCat: cat.id })));
  if (cat.subgroups) {
    cat.subgroups.forEach(sg => {
      ownResources.push(...sg.resources.map(r => ({ ...r, _subgroup: sg.name, _ownCat: cat.id })));
    });
  }

  ownResources.forEach(r => {
    // Categorías: la propia + las adicionales del campo categories
    const activeCats = new Set([cat.id, ...(r.categories || [])]);

    const row = [
      r.title, r.url, r.desc,
      r.type || "", r.status || "review",
      r.tag || "", r.note || "", r._subgroup || "",
      ...CAT_IDS.map(id => activeCats.has(id) ? "TRUE" : "FALSE"),
    ].map(esc);

    resRows.push(row.join(","));
  });
});

// Deduplicar por URL (por si un recurso aparece en múltiples categorías vía `categories`)
const seen = new Set();
const deduped = [resRows[0]];
resRows.slice(1).forEach(row => {
  const url = row.split(",")[1];
  if (!seen.has(url)) { seen.add(url); deduped.push(row); }
});

fs.writeFileSync("resources.csv", deduped.join("\n"), "utf8");
console.log(`✅ resources.csv — ${deduped.length - 1} recursos`);

// ── sources.csv ───────────────────────────────────────────────────────────
const srcHeaders = ["label", "url"];
const srcRows = [srcHeaders.join(","), ...SITE_DATA.sources.map(s => `${esc(s.label)},${esc(s.url)}`)];
fs.writeFileSync("sources.csv", srcRows.join("\n"), "utf8");
console.log(`✅ sources.csv — ${srcRows.length - 1} fuentes`);

console.log("\nLast updated:", LAST_UPDATED);
console.log("\nPróximos pasos:");
console.log("1. Abre Google Sheets y crea un documento nuevo");
console.log("2. Renombra la primera hoja a 'resources'");
console.log("3. Importa resources.csv: Archivo → Importar → Subir");
console.log("4. Crea una segunda hoja, renómbrala 'sources'");
console.log("5. Importa sources.csv en esa hoja");
console.log("6. Sigue las instrucciones de SETUP.md para la API Key y los checkboxes");
