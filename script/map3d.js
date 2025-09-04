const FILE_PATH = "./data/Data.xlsx";
const SHEET_NAME = "MAPS";

let allFeatures = [];
let currentFeatures = [];

const YEAR_BUCKETS = [
  { key: "1968-1990", color: "red", test: (y) => y >= 1968 && y <= 1990 },
  { key: "1990-2000", color: "#ff5733", test: (y) => y > 1990 && y <= 2000 },
  { key: "2000-2005", color: "orange", test: (y) => y > 2000 && y <= 2005 },
  { key: "2005-2010", color: "#f3e476", test: (y) => y > 2005 && y <= 2010 },
  { key: "2010-2015", color: "#51e725", test: (y) => y > 2010 && y <= 2015 },
  { key: "2015-2020", color: "#53c48a", test: (y) => y > 2015 && y <= 2020 },
  { key: ">2020", color: "#336a30", test: (y) => y > 2020 },
  { key: "N/A", color: "gray", test: (y) => isNaN(y) },
];
function bucketForYear(y) {
  for (const b of YEAR_BUCKETS) if (b.test(y)) return b;
  return YEAR_BUCKETS[YEAR_BUCKETS.length - 1];
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

function isVisibleOnGlobe(
  latDeg,
  lonDeg,
  centerLatDeg,
  centerLonDeg,
  eps = 0.001
) {
  const φ1 = toRad(latDeg),
    λ1 = toRad(lonDeg);
  const φ0 = toRad(centerLatDeg),
    λ0 = toRad(centerLonDeg);
  const p = [
    Math.cos(φ1) * Math.cos(λ1),
    Math.cos(φ1) * Math.sin(λ1),
    Math.sin(φ1),
  ];
  const c = [
    Math.cos(φ0) * Math.cos(λ0),
    Math.cos(φ0) * Math.sin(λ0),
    Math.sin(φ0),
  ];
  return p[0] * c[0] + p[1] * c[1] + p[2] * c[2] > eps;
}

function getCurrentGlobeCenter(gd) {
  const r1 = gd?.layout?.geo?.projection?.rotation;
  const r2 = gd?._fullLayout?.geo?.projection?.rotation;
  const r = r1 || r2 || {};
  return {
    lon: typeof r.lon === "number" ? r.lon : 0,
    lat: typeof r.lat === "number" ? r.lat : 0,
  };
}

function ensureGlobalTooltip(gd) {
  let tip = gd.querySelector("#global-pin-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "global-pin-tooltip";
    tip.style.position = "absolute";
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.style.display = "none";
    tip.style.pointerEvents = "none";
    tip.style.zIndex = "999999";
    gd.appendChild(tip);
  }
  return tip;
}

document.addEventListener("DOMContentLoaded", () => {
  wireUI();
  loadXlsx();
});

function wireUI() {
  document
    .getElementById("show-quality-filter")
    ?.addEventListener("click", () => {
      const s = document.getElementById("quality-filter-section");
      if (s) s.style.display = s.style.display === "none" ? "block" : "none";
    });

  document
    .getElementById("select-all-quality")
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(".quality-checkbox")
        .forEach((cb) => (cb.checked = true));
      applyQualityFilter();
    });

  document
    .getElementById("deselect-all-quality")
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(".quality-checkbox")
        .forEach((cb) => (cb.checked = false));
      applyQualityFilter();
    });
}

async function loadXlsx() {
  try {
    if (typeof XLSX === "undefined") throw new Error("SheetJS no se cargó.");
    const res = await fetch(FILE_PATH);
    if (!res.ok)
      throw new Error(`No se pudo cargar ${FILE_PATH} (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();

    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[SHEET_NAME || wb.SheetNames[0]];
    if (!ws) throw new Error(`No existe la hoja "${SHEET_NAME}" en el libro.`);

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    rows.shift();

    allFeatures = rows
      .map((row) => {
        let lon = NaN,
          lat = NaN;
        if (row[8]) {
          const parts = String(row[8])
            .split(",")
            .map((v) => parseFloat(v.trim().replace(",", ".")));
          lon = parts[0];
          lat = parts[1];
        }
        let lastUpdate;
        if (row[2] instanceof Date) lastUpdate = row[2].getFullYear();
        else lastUpdate = parseInt(String(row[2]).replace(/\D/g, ""));

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        return {
          type: "Feature",
          properties: {
            code: row[0],
            name: row[1],
            lastUpdate,
            foods: row[3],
            items: row[4],
            nutrients: row[5],
            fcdbName: row[6],
            qualityIndex: row[7],
            flagImage: row[9],
          },
          geometry: { type: "Point", coordinates: [lon, lat] },
        };
      })
      .filter(Boolean);

    populateQualityFilter(allFeatures);
    currentFeatures = [...allFeatures];
    createPlotlyGlobe(currentFeatures);
  } catch (err) {
    console.error("Error cargando Excel:", err.message);
  }
}

function populateQualityFilter(features) {
  const wrap = document.getElementById("quality-filter-wrap");
  if (!wrap) return;

  const orden = [
    "Minimum",
    "Below Average",
    "Near Average",
    "Above Average",
    "High Quality",
    "Excellent",
  ];

  const filtros = [
    ...new Set(features.map((f) => String(f.properties.qualityIndex))),
  ];
  const filtrosOrdenados = filtros.sort(
    (a, b) => orden.indexOf(a) - orden.indexOf(b)
  );

  wrap.innerHTML = filtrosOrdenados
    .map(
      (q) => `
      <label style="display:flex;align-items:center;gap:8px;margin-right:12px;">
        <input type="checkbox" class="quality-checkbox" value="${q}" checked> ${q}
      </label>`
    )
    .join("");
  wrap.addEventListener("change", applyQualityFilter);
}

function applyQualityFilter() {
  const checkedQualities = Array.from(
    document.querySelectorAll(".quality-checkbox:checked")
  ).map((cb) => cb.value);

  currentFeatures = allFeatures.filter(
    (f) =>
      !checkedQualities.length ||
      checkedQualities.includes(String(f.properties.qualityIndex))
  );

  createPlotlyGlobe(currentFeatures);
}

function createPlotlyGlobe(features) {
  const trace = {
    type: "scattergeo",
    mode: "markers",
    uid: "ortho-pins",
    lon: features.map((f) => f.geometry.coordinates[0]),
    lat: features.map((f) => f.geometry.coordinates[1]),
    marker: { size: 12, opacity: 0.001 },
    hoverinfo: "skip",
    customdata: features.map((f) => ({
      code: f.properties.code,
      name: f.properties.name,
      lastUpdate: f.properties.lastUpdate,
      foods: f.properties.foods,
      items: f.properties.items,
      nutrients: f.properties.nutrients,
      fcdbName: f.properties.fcdbName,
      flagImage: f.properties.flagImage,
    })),
  };

  const layout = {
    geo: {
      projection: { type: "orthographic" },
      showland: true,
      landcolor: "#fff",
      showcountries: true,
      countrycolor: "#555",
      showocean: true,
      oceancolor: "#092e4f",
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#fff",
    showlegend: false,
  };

  Plotly.newPlot("globe", [trace], layout, { responsive: true }).then(() => {
    const gd = document.getElementById("globe");
    if (getComputedStyle(gd).position === "static")
      gd.style.position = "relative";
    ensureGlobalTooltip(gd);
    drawCustomMarkersOrtho(gd);
  });

  const gd = document.getElementById("globe");
  const redraw = () => drawCustomMarkersOrtho(gd);
  gd.on("plotly_afterplot", redraw);
  gd.on("plotly_relayout", redraw);
  gd.on("plotly_relayouting", redraw);
}

function drawCustomMarkersOrtho(gd) {
  gd.querySelectorAll(".custom-marker").forEach((el) => el.remove());
  const globalTip = gd.querySelector("#global-pin-tooltip");
  if (globalTip) globalTip.style.display = "none";

  const svg = gd.querySelector(".main-svg");
  if (!svg) return;

  const plotBg = svg.querySelector(".geo .bg");
  const plotRect = plotBg
    ? plotBg.getBoundingClientRect()
    : svg.getBoundingClientRect();

  const uid = (gd.data && gd.data[0] && gd.data[0].uid) || "ortho-pins";
  let traceGroup = svg.querySelector(
    `.scatterlayer .trace.scattergeo[data-uid="${uid}"]`
  );
  if (!traceGroup)
    traceGroup = svg.querySelector(`.scatterlayer .trace.scattergeo`);
  if (!traceGroup) return;

  const pts = traceGroup.querySelectorAll("path.point");
  if (!pts.length) return;

  const mapBox = gd.getBoundingClientRect();
  const svgBox = svg.getBoundingClientRect();
  const records = gd.data[0].customdata || [];

  const { lat: cLat, lon: cLon } = getCurrentGlobeCenter(gd);

  pts.forEach((pt, domIdx) => {
    const tr = pt.getAttribute("transform") || "";
    const m = tr.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    let cx, cy;

    if (m) {
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      cx = svgBox.left - mapBox.left + x;
      cy = svgBox.top - mapBox.top + y;
    } else {
      const bbox = pt.getBoundingClientRect();
      if (!bbox.width && !bbox.height) return;
      cx = bbox.x - mapBox.x + bbox.width / 2;
      cy = bbox.y - mapBox.y + bbox.height / 2;
    }

    const absX = cx + mapBox.left;
    const absY = cy + mapBox.top;
    if (
      absX < plotRect.left ||
      absX > plotRect.right ||
      absY < plotRect.top ||
      absY > plotRect.bottom
    ) {
      return;
    }

    const d = pt.__data__ || {};
    const i =
      typeof d.i === "number"
        ? d.i
        : typeof d.pointNumber === "number"
        ? d.pointNumber
        : domIdx;

    const dataTrace = gd.data[0];
    const lat_i = dataTrace.lat[i];
    const lon_i = dataTrace.lon[i];
    if (!isVisibleOnGlobe(lat_i, lon_i, cLat, cLon)) return;

    const r = records[i];
    if (!r) return;

    const pinW = 20,
      pinH = 30;
    const fill = bucketForYear(r.lastUpdate).color;

    const div = document.createElement("div");
    div.className = "custom-marker";
    div.style.position = "absolute";
    div.style.left = cx - pinW / 2 + "px";
    div.style.top = cy - pinH + "px";
    div.style.pointerEvents = "auto";
    div.style.zIndex = 1;
    div.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${pinW}" height="${pinH}" viewBox="0 0 20 30">
        <path d="M10,0 C15,0 20,5 20,12 C20,21 10,30 10,30 C10,30 0,21 0,12 C0,5 5,0 10,0Z" fill="${fill}"/>
        <circle cx="10" cy="12" r="4" fill="white"/>
      </svg>
    `;

    const tip = ensureGlobalTooltip(gd);
    const tooltipHTML = `
  <div style="
    display:flex;
    align-items:flex-center;
    gap:10px;
    background:#fff;
  ">
    <!-- tarjeta de texto (misma que antes) -->
    <div class="tooltip-text" style="
      background:#fff;
      border:1px solid #e5e7eb;
      border-radius:8px;
      padding:8px 10px;
      box-shadow:0 8px 20px rgba(0,0,0,.12);
      font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      color:#111827;
      max-width:280px;
      white-space:normal;
    ">
      <strong>Code:</strong> ${r.code}<br>
      <strong>Country:</strong> ${r.name}<br>
      <strong>Last update:</strong> ${r.lastUpdate}<br>
      <strong>Number of foods:</strong> ${r.foods}<br>
      <strong>Number of items:</strong> ${r.items}<br>
      <strong>Nutrients/Compounds:</strong> ${r.nutrients}<br>
      <strong>FCDB Name:</strong> ${r.fcdbName}
    </div>

    <!-- tarjeta de bandera a la derecha (misma estética) -->
    ${
      r.flagImage
        ? `<div style="
              background:#fff;
              border:1px solid #e5e7eb;
              border-radius:8px;
              padding:6px;
              box-shadow:0 8px 20px rgba(0,0,0,.12);
              display:flex;align-items:center;justify-content:center;
            ">
              <img src="${r.flagImage}" alt="Flag of ${r.name}"
                   style="display:block; width:62px; height:40px; object-fit:cover; border-radius:3px;">
           </div>`
        : ""
    }
  </div>
`;

    const showTip = () => {
      tip.innerHTML = tooltipHTML;
      tip.style.left = cx + 14 + "px";
      tip.style.top = cy - 44 + "px";
      tip.style.display = "block";
    };
    const hideTip = () => {
      tip.style.display = "none";
    };
    const follow = (ev) => {
      const base = gd.getBoundingClientRect();
      tip.style.left = ev.clientX - base.left + 12 + "px";
      tip.style.top = ev.clientY - base.top - 32 + "px";
    };

    div.addEventListener("mouseenter", showTip);
    div.addEventListener("mouseleave", hideTip);
    div.addEventListener("mousemove", follow);

    gd.appendChild(div);
  });
}
