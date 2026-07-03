/**
 * netlify/functions/sheets.js
 * Lee datos desde Google Sheets para Todos x Vzla
 * -------------------------------------------------
 * Requiere las variables de entorno en Netlify:
 *   SHEET_ID  — el ID del Google Sheet (de la URL: /d/ESTE_ID/edit)
 *   SHEET_API_KEY — API Key de Google Cloud (solo lectura, sin OAuth)
 *
 * El Sheet debe tener dos hojas (tabs):
 *   - "resources": columnas definidas en COLUMNS abajo
 *   - "sources":   columnas A=label, B=url
 *
 * Caché: 2 minutos en CDN de Netlify.
 */

const SHEET_ID = process.env.SHEET_ID;
const API_KEY = process.env.SHEET_API_KEY;

// Las 10 categorías fijas del sitio (con sus IDs e íconos).
// No se gestionan desde Sheets — son parte del código.
const CATEGORIES = [
  { id: "cat-desaparecidos",        icon: "🔎", title: "Personas desaparecidas",         desc: "Herramientas para registrar personas desaparecidas y confirmar personas localizadas." },
  { id: "cat-hospitales",           icon: "🏥", title: "Personas en hospitales",          desc: "Buscadores de pacientes hospitalizados y personas identificadas en centros de salud." },
  { id: "cat-mascotas-desaparecidas", icon: "🐶", title: "Mascotas desaparecidas",        desc: "Registro y búsqueda de mascotas perdidas." },
  { id: "cat-insumos",              icon: "🤝", title: "Insumos y voluntariado",          desc: "Herramientas para coordinar ayuda, voluntarios, transporte e insumos." },
  { id: "cat-danos",                icon: "🗺️", title: "Daños estructurales",             desc: "Mapas colaborativos para identificar edificios colapsados, zonas de riesgo y afectaciones." },
  { id: "cat-oficios",              icon: "🏗️", title: "Producción y Oficios",            desc: "Personas y organizaciones que fabrican o coordinan recursos físicos." },
  { id: "cat-traductores",          icon: "🌐", title: "Traductores",                     desc: "Voluntarios de traducción para facilitar la comunicación internacional." },
  { id: "cat-salud",                icon: "🩺", title: "Salud",                           desc: "Atención médica presencial, remota y apoyo psicológico." },
  { id: "cat-mascotas-apoyo",       icon: "🐾", title: "Organizaciones de mascotas",      desc: "Rescate, alimentación, atención veterinaria y refugio temporal." },
  { id: "cat-donaciones",           icon: "❤️", title: "Donaciones",                      desc: "Canales oficiales y campañas verificadas para realizar donaciones." },
];

// Columnas de la hoja "resources" (en orden, de A a Q):
// A  title
// B  url
// C  desc
// D  type         (Instagram / GoFundMe / Netlify / ArcGIS / GlobalGiving / vacío)
// E  status       (verified / review / new)
// F  tag          (subcategoría para Producción y Oficios)
// G  note         (nota aclaratoria)
// H  subgroup     (nombre del subgrupo, ej "Caracas" en mascotas)
// I  cat-desaparecidos     (TRUE/FALSE checkbox)
// J  cat-hospitales        (TRUE/FALSE)
// K  cat-mascotas-desaparecidas (TRUE/FALSE)
// L  cat-insumos           (TRUE/FALSE)
// M  cat-danos             (TRUE/FALSE)
// N  cat-oficios           (TRUE/FALSE)
// O  cat-traductores       (TRUE/FALSE)
// P  cat-salud             (TRUE/FALSE)
// Q  cat-mascotas-apoyo    (TRUE/FALSE)
// R  cat-donaciones        (TRUE/FALSE)

const CAT_COLS = [
  "cat-desaparecidos", "cat-hospitales", "cat-mascotas-desaparecidas",
  "cat-insumos", "cat-danos", "cat-oficios", "cat-traductores",
  "cat-salud", "cat-mascotas-apoyo", "cat-donaciones",
];

async function fetchSheet(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status} for ${sheetName}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.values || [];
}

function parseResources(rows) {
  if (!rows.length) return [];
  // Saltar la primera fila (headers)
  const data = rows.slice(1);

  return data
    .filter(r => r[0] && r[1]) // título y URL son obligatorios
    .map(r => {
      const categories = CAT_COLS
        .filter((_, i) => (r[8 + i] || "").toUpperCase() === "TRUE")
        .map(id => id);

      return {
        title: r[0] || "",
        url: r[1] || "",
        desc: r[2] || "",
        type: r[3] || null,
        status: r[4] || "review",
        tag: r[5] || null,
        note: r[6] || null,
        subgroup: r[7] || null,
        categories,
      };
    });
}

function parseSources(rows) {
  if (!rows.length) return [];
  return rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({ label: r[0], url: r[1] }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

exports.handler = async function () {
  if (!SHEET_ID || !API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Missing env vars",
        hasSheetId: !!SHEET_ID,
        hasApiKey: !!API_KEY,
      }),
    };
  }

  let resourceRows, sourceRows;

  try {
    resourceRows = await fetchSheet("resources");
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "resources failed: " + err.message }),
    };
  }

  try {
    sourceRows = await fetchSheet("sources");
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "sources failed: " + err.message }),
    };
  }

  try {
    const resources = parseResources(resourceRows);
    const sources = parseSources(sourceRows);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ categories: CATEGORIES, resources, sources }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "parse failed: " + err.message }),
    };
  }
};
