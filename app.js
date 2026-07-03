/**
 * app.js — Todos x Vzla
 * Lee datos desde /api/sheets (Netlify Function → Google Sheets)
 * y usa /api/og-image como proxy para las imágenes OG.
 */
(function () {
  "use strict";

  const FALLBACK_UPDATED = "3 julio 2026";

  const STATUS_LABEL = {
    verified: { label: "Verificado", cls: "tag-verified", dot: "🟢" },
    review:   { label: "En revisión", cls: "tag-review",   dot: "🟡" },
    new:      { label: "Nuevo",       cls: "tag-new",      dot: "🔵" },
  };

  let SITE_DATA = null;
  let activeFilter = "all"; // "all" o un cat id

  // ── Proxy de imagen OG ────────────────────────────────────────────────────
  function ogImageUrl(resourceUrl) {
    return `/api/og-image?url=${encodeURIComponent(resourceUrl)}`;
  }

  // ── Recursos de una categoría, ordenados por nº de categorías ─────────────
  function getResourcesForCategory(categoryId) {
    return SITE_DATA.resources
      .filter(r => r.categories.includes(categoryId))
      .sort((a, b) => b.categories.length - a.categories.length);
  }

  // ── Render de tarjeta ─────────────────────────────────────────────────────
  function renderResourceCard(r) {
    const status = STATUS_LABEL[r.status] || STATUS_LABEL.review;
    const note   = r.note ? `<div class="res-note">ℹ️ ${r.note}</div>` : "";
    const thumb  = `<img class="res-thumb" src="${ogImageUrl(r.url)}" alt="" loading="lazy" onerror="this.remove()">`;
    return `
      <a class="res-card" href="${r.url}" target="_blank" rel="noopener">
        <div class="res-top">
          <div class="res-title">${r.title}</div>
          ${thumb}
        </div>
        <div class="res-url">${r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
        <p class="res-desc">${r.desc}</p>
        <div class="res-tags">
          ${r.type     ? `<span class="tag">${r.type}</span>`     : ""}
          ${r.tag      ? `<span class="tag">${r.tag}</span>`      : ""}
          ${r.subgroup ? `<span class="tag">${r.subgroup}</span>` : ""}
          <span class="tag tag-status ${status.cls}">${status.dot} ${status.label}</span>
        </div>
        ${note}
      </a>`;
  }

  // ── Render de una categoría ───────────────────────────────────────────────
  function renderCategory(category) {
    const resources = getResourcesForCategory(category.id);
    if (!resources.length) return "";

    const hasSubgroups = resources.some(r => r.subgroup);
    let bodyHtml = "";

    if (hasSubgroups) {
      const groups  = {};
      const noGroup = [];
      resources.forEach(r => {
        if (r.subgroup) {
          if (!groups[r.subgroup]) groups[r.subgroup] = [];
          groups[r.subgroup].push(r);
        } else {
          noGroup.push(r);
        }
      });
      if (noGroup.length) bodyHtml += `<div class="res-grid">${noGroup.map(renderResourceCard).join("")}</div>`;
      Object.entries(groups).forEach(([name, items]) => {
        bodyHtml += `<div class="subgroup-title">${name}</div>
          <div class="res-grid">${items.map(renderResourceCard).join("")}</div>`;
      });
    } else {
      bodyHtml = `<div class="res-grid">${resources.map(renderResourceCard).join("")}</div>`;
    }

    return `
      <div class="cat-card" id="${category.id}">
        <div class="cat-head">
          <span class="cat-icon">${category.icon}</span>
          <span class="cat-headtext">
            <h3>${category.title}</h3>
            <p>${category.desc}</p>
          </span>
          <span class="cat-count">${resources.length} recurso${resources.length === 1 ? "" : "s"}</span>
        </div>
        <div class="cat-body">
          <div class="cat-body-inner">${bodyHtml}</div>
        </div>
      </div>`;
  }

  // ── Render de pills de filtro ─────────────────────────────────────────────
  function renderFilterPills() {
    const wrap = document.getElementById("filterPills");
    if (!wrap) return;

    const todoPill = `<button class="filter-pill ${activeFilter === "all" ? "active" : ""}" data-filter="all">Todo</button>`;

    const catPills = SITE_DATA.categories.map(c => {
      const count = SITE_DATA.resources.filter(r => r.categories.includes(c.id)).length;
      if (!count) return ""; // ocultar categorías vacías
      return `<button class="filter-pill ${activeFilter === c.id ? "active" : ""}" data-filter="${c.id}">
        ${c.icon} ${c.title}
      </button>`;
    }).join("");

    wrap.innerHTML = todoPill + catPills;
  }

  // ── Render principal ──────────────────────────────────────────────────────
  function renderAll() {
    const categoriesToShow = activeFilter === "all"
      ? SITE_DATA.categories
      : SITE_DATA.categories.filter(c => c.id === activeFilter);

    const total = SITE_DATA.resources.length;
    document.getElementById("totalCount").textContent =
      `${total} recurso${total === 1 ? "" : "s"} en ${SITE_DATA.categories.length} categorías`;

    const html = categoriesToShow.map(c => renderCategory(c)).join("");
    document.getElementById("catList").innerHTML = html || `<div class="data-error"><p>No hay recursos en esta categoría todavía.</p></div>`;
  }

  // ── Render de fuentes ─────────────────────────────────────────────────────
  function renderSources() {
    const el = document.getElementById("sourcesList");
    if (!el || !SITE_DATA.sources?.length) return;
    el.innerHTML = SITE_DATA.sources.map(s =>
      `<a class="source-chip" href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`
    ).join("");
  }

  // ── Loading / Error ───────────────────────────────────────────────────────
  function showLoading() {
    document.getElementById("catList").innerHTML = `
      <div class="data-loading">
        <div class="data-loading-spinner"></div>
        <p>Cargando recursos…</p>
      </div>`;
  }

  function showError(msg) {
    document.getElementById("catList").innerHTML = `
      <div class="data-error">
        <p>⚠️ No se pudieron cargar los recursos.<br><small>${msg}</small></p>
        <button onclick="location.reload()">Reintentar</button>
      </div>`;
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    // Pills de filtro
    const pill = e.target.closest("[data-filter]");
    if (pill) {
      activeFilter = pill.getAttribute("data-filter");
      renderFilterPills();
      renderAll();
      return;
    }
    // Navegación legacy data-goto (accesos rápidos si quedan)
    const trigger = e.target.closest("[data-goto]");
    if (trigger) {
      const target = document.getElementById(trigger.getAttribute("data-goto"));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // ── Share ─────────────────────────────────────────────────────────────────
  document.getElementById("shareBtn").addEventListener("click", async () => {
    const shareData = {
      title: "Todos x Vzla — Directorio de ayuda",
      text: "Directorio centralizado de herramientas de la comunidad para apoyar el rescate y la recuperación tras el terremoto en Venezuela.",
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        alert("Enlace copiado al portapapeles.");
      }
    } catch {}
  });

  // ── Back to top ───────────────────────────────────────────────────────────
  const backTop = document.getElementById("backTop");
  window.addEventListener("scroll", () => {
    backTop.classList.toggle("show", window.scrollY > 480);
  });
  backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    document.getElementById("lastUpdated").textContent = FALLBACK_UPDATED;
    showLoading();
    try {
      const res = await fetch("/api/sheets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      SITE_DATA = await res.json();
      if (SITE_DATA.error) throw new Error(SITE_DATA.error);
      if (SITE_DATA.lastUpdated) document.getElementById("lastUpdated").textContent = SITE_DATA.lastUpdated;
      renderFilterPills();
      renderAll();
      renderSources();
    } catch (err) {
      console.error("Error loading data:", err);
      showError(err.message);
    }
  }

  init();
})();
