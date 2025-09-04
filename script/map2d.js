const FILE_PATH = "./data/Data.xlsx";
const SHEET_NAME = "MAPS";

let allRecords = [];
let currentFiltered = [];

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
      applyFilters();
    });
  document
    .getElementById("deselect-all-quality")
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(".quality-checkbox")
        .forEach((cb) => (cb.checked = false));
      applyFilters();
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

    const data = rows
      .slice(1)
      .map((row) => {
        let lat = NaN,
          lon = NaN;
        if (row[8]) {
          const coords = String(row[8])
            .split(",")
            .map((v) => parseFloat(v.trim().replace(",", ".")));
          lon = coords[0];
          lat = coords[1];
        }
        let lastUpdate;
        if (row[2] instanceof Date) lastUpdate = row[2].getFullYear();
        else lastUpdate = parseInt(String(row[2]).replace(/\D/g, ""));

        return {
          code: row[0],
          name: row[1],
          lastUpdate,
          foods: row[3],
          items: row[4],
          nutrients: row[5],
          fcdbName: row[6],
          qualityIndex: row[7],
          flagImage: row[9],
          lat,
          lon,
        };
      })
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

    allRecords = data;

    populateQualityFilter(data);
    populateYearFilter(data);

    currentFiltered = [...allRecords];
    renderPlot(currentFiltered);
  } catch (err) {
    console.error("Error cargando Excel:", err.message);
  }
}

function populateQualityFilter(records) {
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

  const filtros = [...new Set(records.map((r) => String(r.qualityIndex)))];
  const filtrosOrdenados = filtros.sort(
    (a, b) => orden.indexOf(a) - orden.indexOf(b)
  );

  wrap.innerHTML = filtrosOrdenados
    .map(
      (q) => `
    <label style="display:flex;align-items:center;gap:8px;">
      <input type="checkbox" class="quality-checkbox" value="${q}" checked> ${q}
    </label>`
    )
    .join("");
  wrap.addEventListener("change", applyFilters);
}

function populateYearFilter(records) {
  const wrap = document.getElementById("year-filter-wrap");
  if (!wrap) return;
  const years = [...new Set(records.map((r) => r.lastUpdate))]
    .filter(Boolean)
    .sort((a, b) => a - b);
  wrap.innerHTML = years
    .map(
      (y) => `
    <label style="display:flex;align-items:center;gap:8px;">
      <input type="checkbox" class="year-checkbox" value="${y}" checked> ${y}
    </label>`
    )
    .join("");
  wrap.addEventListener("change", applyFilters);
}

function applyFilters() {
  const checkedQualities = Array.from(
    document.querySelectorAll(".quality-checkbox:checked")
  ).map((cb) => cb.value);

  const checkedYears = Array.from(
    document.querySelectorAll(".year-checkbox:checked")
  ).map((cb) => parseInt(cb.value, 10));

  currentFiltered = allRecords.filter((r) => {
    const okQ =
      !checkedQualities.length ||
      checkedQualities.includes(String(r.qualityIndex));
    const okY = !checkedYears.length || checkedYears.includes(r.lastUpdate);
    return okQ && okY;
  });

  renderPlot(currentFiltered);
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

function renderPlot(records) {
  const traces = [
    {
      type: "scattergeo",
      mode: "markers",
      showlegend: false,
      uid: "pins-trace",
      lon: records.map((r) => r.lon),
      lat: records.map((r) => r.lat),
      marker: { size: 10, opacity: 0.001 },
      hoverinfo: "skip",
      customdata: records,
    },
  ];

  const legendItems = YEAR_BUCKETS.map((b) => ({
    name: b.key,
    color: b.color,
  })).concat([{ name: "Information", color: "#000000" }]);
  legendItems.forEach((item) => {
    traces.push({
      type: "scattergeo",
      mode: "markers",
      name: item.name,
      showlegend: true,
      lon: [],
      lat: [],
      marker: { symbol: "square", size: 14, color: item.color },
      hoverinfo: "skip",
    });
  });

  const layout = {
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#fff",
    showlegend: true,
    legend: {
      title: { text: "Years: last updated" },
      x: 0,
      y: 1,
      xanchor: "left",
      yanchor: "top",
      bgcolor: "rgba(255,255,255,1)",
      bordercolor: "#ccc",
      borderwidth: 1,
      font: { color: "#000", size: 12 },
    },
    geo: {
      projection: { type: "equirectangular" },
      domain: { x: [0.1, 0.9], y: [0, 1] },
      showland: true,
      landcolor: "#f5f5f5",
      showcountries: true,
      countrycolor: "#555",
      showocean: true,
      oceancolor: "#092e4f",
      lakecolor: "#092e4f",
      coastlinecolor: "#999",
      lonaxis: { range: [-180, 180] },
      lataxis: { range: [-80, 80] },
      resolution: 50,
    },
  };

  Plotly.newPlot("map", traces, layout, {
    responsive: true,
    displayModeBar: false,
  }).then(() => {
    const gd = document.getElementById("map");
    if (getComputedStyle(gd).position === "static")
      gd.style.position = "relative";
    gd.style.overflow = "hidden";
    ensureGlobalTooltip(gd);
    drawCustomMarkers(gd);
  });

  const gd = document.getElementById("map");
  gd.on("plotly_afterplot", () => drawCustomMarkers(gd));
  gd.on("plotly_relayout", () => drawCustomMarkers(gd));
}

function drawCustomMarkers(gd) {
  gd.querySelectorAll(".custom-marker").forEach((el) => el.remove());
  const globalTip = gd.querySelector("#global-pin-tooltip");
  if (globalTip) globalTip.style.display = "none";

  const svg = gd.querySelector(".main-svg");
  if (!svg) return;

  const plotBg = svg.querySelector(".geo .bg");
  const plotRect = plotBg
    ? plotBg.getBoundingClientRect()
    : svg.getBoundingClientRect();

  const traceUid = (gd.data && gd.data[0] && gd.data[0].uid) || "pins-trace";
  let traceGroup = svg.querySelector(
    `.scatterlayer .trace.scattergeo[data-uid="${traceUid}"]`
  );
  if (!traceGroup)
    traceGroup = svg.querySelector(`.scatterlayer .trace.scattergeo`);
  if (!traceGroup) return;

  const pts = traceGroup.querySelectorAll("path.point");
  if (!pts || !pts.length) return;

  const mapBox = gd.getBoundingClientRect();
  const svgBox = svg.getBoundingClientRect();
  const records = gd.data[0].customdata || [];

  pts.forEach((pt, idxDom) => {
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
        : idxDom;

    const r = records[i];
    if (!r) return;

    const pinWidth = 20,
      pinHeight = 30;
    const fill = bucketForYear(r.lastUpdate).color;

    const div = document.createElement("div");
    div.className = "custom-marker";
    div.style.position = "absolute";
    div.style.left = cx - pinWidth / 2 + "px";
    div.style.top = cy - pinHeight + "px";
    div.style.pointerEvents = "auto";
    div.style.zIndex = 3;

    div.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${pinWidth}" height="${pinHeight}" viewBox="0 0 20 30">
        <path d="M10,0 C15,0 20,5 20,12 C20,21 10,30 10,30 C10,30 0,21 0,12 C0,5 5,0 10,0Z" fill="${fill}"/>
        <circle cx="10" cy="12" r="4" fill="white"/>
      </svg>
    `;

    const tip = ensureGlobalTooltip(gd);
    const tooltipHTML = `
      <div style="display:flex; align-items:center; gap:10px; background:#fff;">
        <div class="tooltip-text" style="
          background:#fff; border:1px solid #e5e7eb; border-radius:8px;
          padding:8px 10px; box-shadow:0 8px 20px rgba(0,0,0,.12);
          font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          color:#111827; max-width:280px; white-space:normal;">
          <strong>Code:</strong> ${r.code}<br>
          <strong>Country:</strong> ${r.name}<br>
          <strong>Last update:</strong> ${r.lastUpdate}<br>
          <strong>Number of foods:</strong> ${r.foods}<br>
          <strong>Number of items:</strong> ${r.items}<br>
          <strong>Nutrients/Compounds:</strong> ${r.nutrients}<br>
          <strong>FCDB Name:</strong> ${r.fcdbName}
        </div>
        ${
          r.flagImage
            ? `<div style="
                  background:#fff; border:1px solid #e5e7eb; border-radius:8px;
                  padding:6px; box-shadow:0 8px 20px rgba(0,0,0,.12);
                  display:flex; align-items:center; justify-content:center;">
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
