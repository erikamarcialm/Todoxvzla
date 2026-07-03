/**
 * netlify/functions/og-image.js
 * Proxy de imágenes OG para Todos x Vzla
 * ----------------------------------------
 * Recibe ?url=https://... y devuelve:
 *   - La imagen og:image del sitio (si existe y carga correctamente)
 *   - 404 si no hay og:image o no se puede obtener
 *
 * Esto evita los bloqueos de hotlinking (403) que ocurren cuando
 * el navegador del visitante intenta cargar directamente las imágenes
 * de CDNs externos. El servidor actúa como intermediario.
 *
 * Caché: 1 hora en CDN de Netlify, 24h stale-while-revalidate.
 */

exports.handler = async function (event) {
  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) {
    return { statusCode: 400, body: "Missing url parameter" };
  }

  // Validar que sea una URL http/https (seguridad básica)
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return { statusCode: 400, body: "Invalid URL" };
  }

  try {
    // 1. Obtener el HTML de la página para extraer og:image
    const htmlRes = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TodosxVzlaBot/1.0; +https://todosxvzla.netlify.app)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!htmlRes.ok) {
      return { statusCode: 404, body: "Could not fetch page" };
    }

    const html = await htmlRes.text();

    // 2. Extraer og:image del HTML
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    if (!ogMatch) {
      return { statusCode: 404, body: "No og:image found" };
    }

    let imageUrl = ogMatch[1];

    // Resolver URLs relativas
    if (imageUrl.startsWith("/")) {
      imageUrl = `${parsedUrl.protocol}//${parsedUrl.host}${imageUrl}`;
    }

    // 3. Descargar la imagen actuando como proxy
    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TodosxVzlaBot/1.0; +https://todosxvzla.netlify.app)",
        Referer: parsedUrl.href,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!imgRes.ok) {
      return { statusCode: 404, body: "Image fetch failed" };
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    // Solo permitir tipos de imagen reales
    if (!contentType.startsWith("image/")) {
      return { statusCode: 404, body: "Not an image" };
    }

    const imageBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
      body: base64,
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("og-image proxy error:", err.message);
    return { statusCode: 500, body: "Internal error" };
  }
};
