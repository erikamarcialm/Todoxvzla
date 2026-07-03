/**
 * netlify/functions/sheets.js
 * Lee datos desde Google Sheets para Todos x Vzla
 * -------------------------------------------------
 * Columnas de la hoja "resources" (A–I + 29 checkboxes):
 * A title | B url | C desc | D type | E status | F tag | G note | H subgroup
 * I–AG: una columna por categoría (TRUE/FALSE checkbox)
 */

const SHEET_ID = process.env.SHEET_ID;
const API_KEY  = process.env.SHEET_API_KEY;

// 29 categorías en el orden exacto de las columnas I–AG del Sheet
const CATEGORIES = [
  { id: "cat-desaparecidos",    icon: "🔎", title: "Desaparecidos",          desc: "Personas desaparecidas." },
  { id: "cat-hospitalizados",   icon: "🏥", title: "Hospitalizados",          desc: "Personas hospitalizadas." },
  { id: "cat-ninos",            icon: "🍼", title: "Protección de niños",     desc: "Protección y cuidado de niños." },
  { id: "cat-acopio",           icon: "📦", title: "Acopio",                  desc: "Centros de acopio de insumos." },
  { id: "cat-resguardo-personas", icon: "⛺️", title: "Resguardo",            desc: "Resguardo y refugio de personas." },
  { id: "cat-mascotas",         icon: "🐾", title: "Mascotas",                desc: "Recursos generales de mascotas." },
  { id: "cat-mascotas-perdidas",icon: "🐶", title: "Mascotas perdidas",       desc: "Mascotas perdidas y encontradas." },
  { id: "cat-veterinarias",     icon: "🌡️", title: "Veterinarias gratuitas",  desc: "Veterinarias gratuitas." },
  { id: "cat-resguardo",        icon: "🏠", title: "Resguardo mascotas",      desc: "Resguardo de mascotas." },
  { id: "cat-acopio-mascotas",  icon: "🐱", title: "Acopio mascotas",         desc: "Centros de acopio para mascotas." },
  { id: "cat-danos",            icon: "🗺️", title: "Daños",                   desc: "Daños estructurales." },
  { id: "cat-servicios",        icon: "🛠️", title: "Servicios",               desc: "Productores y profesionales." },
  { id: "cat-hurnos",           icon: "⚰️", title: "Hurnos/Cremación",        desc: "Servicios funerarios." },
  { id: "cat-camas",            icon: "🛏️", title: "Camas",                   desc: "Productores de camas y literas." },
  { id: "cat-ropa",             icon: "👕", title: "Ropa",                    desc: "Productores de ropa." },
  { id: "cat-luces",            icon: "💡", title: "Luces",                   desc: "Productores de luces." },
  { id: "cat-ferulas",          icon: "🦴", title: "Férulas 3D",              desc: "Productores de férulas 3D." },
  { id: "cat-ferreterias",      icon: "🔧", title: "Ferreterías",             desc: "Ferreterías." },
  { id: "cat-alimentacion",     icon: "🍳", title: "Alimentación",            desc: "Servicios de alimentación." },
  { id: "cat-psicologos",       icon: "🧠", title: "Psicólogos",              desc: "Apoyo psicológico." },
  { id: "cat-arquitectos",      icon: "🏗️", title: "Arquitectos",             desc: "Arquitectos e ingenieros." },
  { id: "cat-transporte",       icon: "🚚", title: "Transporte",              desc: "Transportistas." },
  { id: "cat-medicina",         icon: "💊", title: "Medicina",                desc: "Medicina y salud." },
  { id: "cat-medicos",          icon: "👨‍⚕️", title: "Médicos",              desc: "Médicos voluntarios." },
  { id: "cat-vacunacion",       icon: "💉", title: "Vacunación",              desc: "Centros de vacunación." },
  { id: "cat-triaje",           icon: "🩺", title: "Triaje",                  desc: "Puntos de triaje." },
  { id: "cat-rayosx",           icon: "🩻", title: "Rayos X",                 desc: "Rayos X." },
  { id: "cat-clinicas",         icon: "🚑", title: "Clínicas gratuitas",      desc: "Clínicas gratuitas." },
  { id: "cat-donaciones",       icon: "❤️", title: "Donaciones",              desc: "Donaciones verificadas." },
  { id: "cat-internet",         icon: "📡", title: "Internet",                desc: "Satélites e Internet." },
];

const CAT_IDS = CATEGORIES.map(c => c.id);

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
  return rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => {
      // Columnas I en adelante (índice 8+) = checkboxes de categorías
      const categories = CAT_IDS.filter((_, i) => (r[8 + i] || "").toUpperCase() === "TRUE");
      return {
        title:      r[0] || "",
        url:        r[1] || "",
        desc:       r[2] || "",
        type:       r[3] || null,
        status:     r[4] || "review",
        tag:        r[5] || null,
        note:       r[6] || null,
        subgroup:   r[7] || null,
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
      body: JSON.stringify({ error: "Missing env vars", hasSheetId: !!SHEET_ID, hasApiKey: !!API_KEY }),
    };
  }

  let resourceRows, sourceRows;

  try { resourceRows = await fetchSheet("resources"); }
  catch (err) { return { statusCode: 500, body: JSON.stringify({ error: "resources failed: " + err.message }) }; }

  try { sourceRows = await fetchSheet("sources"); }
  catch (err) { return { statusCode: 500, body: JSON.stringify({ error: "sources failed: " + err.message }) }; }

  try {
    const resources = parseResources(resourceRows);
    const sources   = parseSources(sourceRows);
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
    return { statusCode: 500, body: JSON.stringify({ error: "parse failed: " + err.message }) };
  }
};
