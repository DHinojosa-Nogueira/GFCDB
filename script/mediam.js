const FILE_PATH = "./data/Data.xlsx";
const SHEET_NAME = "Median";
const MODAL_SHEET_NAME = "%Occ";

let allRows = [];
let modalRows = [];

document.addEventListener("DOMContentLoaded", () => {
  loadXlsx();
  wireFoodGroupToggle();
  wireModal();
});

function wireFoodGroupToggle() {
  document
    .getElementById("show-food-group-filter")
    ?.addEventListener("click", () => {
      const section = document.getElementById("food-group-filter-section");
      if (section)
        section.style.display =
          section.style.display === "none" ? "block" : "none";
    });
}

function wireModal() {
  const modal = document.getElementById("extra-modal");
  const openBtn = document.getElementById("open-extra-table");

  openBtn?.addEventListener("click", () => openModal(modal));

  modal?.addEventListener("click", (e) => {
    if (e.target.matches("[data-close-modal]")) closeModal(modal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.classList.contains("modal--open")) {
      closeModal(modal);
    }
  });
}

function openModal(modalEl) {
  modalEl.classList.add("modal--open");
  modalEl.setAttribute("aria-hidden", "false");
  const wrap = document.getElementById("extra-table-wrap");
  if (modalRows.length) renderTable(modalRows, wrap);
}

function closeModal(modalEl) {
  modalEl.classList.remove("modal--open");
  modalEl.setAttribute("aria-hidden", "true");
}

async function loadXlsx() {
  const statusEl = document.getElementById("status");
  const wrap = document.getElementById("table-wrap");
  const openBtn = document.getElementById("open-extra-table");

  try {
    if (typeof XLSX === "undefined") {
      throw new Error(
        "SheetJS no se cargó. Revisa la etiqueta <script> del CDN."
      );
    }

    const res = await fetch(FILE_PATH);
    if (!res.ok)
      throw new Error(`No se pudo cargar ${FILE_PATH} (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();

    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    const name = SHEET_NAME || wb.SheetNames[0];
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`No existe la hoja "${name}" en el libro.`);
    let rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    if (rows.length) {
      const colCount = rows[0].length;
      const nonEmptyCols = [];
      for (let col = 0; col < colCount; col++) {
        if (
          rows.some((row) => row[col] !== "" && typeof row[col] !== "undefined")
        ) {
          nonEmptyCols.push(col);
        }
      }
      rows = rows.map((row) => nonEmptyCols.map((idx) => row[idx]));
    }

    let rowsExtra = [];
    if (MODAL_SHEET_NAME && wb.Sheets[MODAL_SHEET_NAME]) {
      const wsExtra = wb.Sheets[MODAL_SHEET_NAME];
      rowsExtra = XLSX.utils.sheet_to_json(wsExtra, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      if (rowsExtra.length) {
        const colCount = rowsExtra[0].length;
        const nonEmptyCols = [];
        for (let col = 0; col < colCount; col++) {
          if (
            rowsExtra.some(
              (row) => row[col] !== "" && typeof row[col] !== "undefined"
            )
          ) {
            nonEmptyCols.push(col);
          }
        }
        rowsExtra = rowsExtra.map((row) => nonEmptyCols.map((idx) => row[idx]));
      }
    } else {
      if (openBtn) openBtn.style.display = "none";
    }

    allRows = rows;
    modalRows = rowsExtra;

    populateFoodGroupFilter(rows);
    populateColumnFilter(rows);
    renderTable(rows, wrap);

    if (openBtn) {
      openBtn.style.display = modalRows.length ? "inline-block" : "none";
    }
  } catch (err) {
    statusEl?.classList.add("error");
    if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    if (wrap) wrap.innerHTML = "";
  }
}

function renderTable(rows, container) {
  container.innerHTML = "";
  if (!rows.length) {
    container.textContent = "Sin datos.";
    return;
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const headTr = document.createElement("tr");
  for (const h of rows[0]) {
    const th = document.createElement("th");
    th.textContent = h;
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const r of rows.slice(1)) {
    const tr = document.createElement("tr");
    for (const c of r) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.appendChild(table);
}

function populateFoodGroupFilter(rows) {
  const section = document.getElementById("food-group-filter-section");
  if (!rows.length) return;

  const foodGroups = [...new Set(rows.slice(1).map((r) => r[2]))]
    .filter(Boolean)
    .sort();

  section.innerHTML = `<div class="filter-actions" style="display:flex; gap:12px; margin-bottom:16px;">
      <button id="select-all-food-groups">Marcar todos</button>
      <button id="deselect-all-food-groups">Desmarcar todos</button>
    </div>
    <div>
      ${foodGroups
        .map(
          (g) =>
            `<label style="margin-right:12px;">
              <input type="checkbox" class="food-group-checkbox" value="${g}" checked> ${g}
            </label>`
        )
        .join("")}
    </div>`;

  section.addEventListener("change", applyCombinedFilters);

  document.getElementById("select-all-food-groups").onclick = () => {
    document
      .querySelectorAll(".food-group-checkbox")
      .forEach((cb) => (cb.checked = true));
    applyCombinedFilters();
  };

  document.getElementById("deselect-all-food-groups").onclick = () => {
    document
      .querySelectorAll(".food-group-checkbox")
      .forEach((cb) => (cb.checked = false));
    applyCombinedFilters();
  };
}

function filterByFoodGroups() {
  const checked = Array.from(
    document.querySelectorAll(".food-group-checkbox:checked")
  ).map((cb) => cb.value);
  let filteredRows;
  if (
    checked.length === 0 ||
    checked.length === document.querySelectorAll(".food-group-checkbox").length
  ) {
    filteredRows = allRows;
  } else {
    filteredRows = [
      allRows[0],
      ...allRows.slice(1).filter((r) => checked.includes(r[2])),
    ];
  }
  renderTable(filteredRows, document.getElementById("table-wrap"));
}

function populateColumnFilter(rows) {
  const section = document.getElementById("column-filter-section");
  if (!rows.length || rows[0].length < 5) return;

  section.innerHTML = `<div class="filter-actions">
      <button id="select-all-columns">Marcar todos</button>
      <button id="deselect-all-columns">Desmarcar todos</button>
    </div>
    <div class="filter-checkboxes">
      ${Array.from({ length: rows[0].length - 4 }, (_, i) => {
        const idx = i + 4;
        return `<label>
          <input type="checkbox" class="column-checkbox" value="${idx}" checked> ${rows[0][idx]}
        </label>`;
      }).join("")}
    </div>`;

  const toggleBtn = document.getElementById("show-column-filter");
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      section.style.display =
        section.style.display === "none" ? "block" : "none";
    };
  }

  section.querySelector("#select-all-columns").onclick = () => {
    section
      .querySelectorAll(".column-checkbox")
      .forEach((cb) => (cb.checked = true));
    applyCombinedFilters();
  };
  section.querySelector("#deselect-all-columns").onclick = () => {
    section
      .querySelectorAll(".column-checkbox")
      .forEach((cb) => (cb.checked = false));
    applyCombinedFilters();
  };

  section.addEventListener("change", applyCombinedFilters);
}

function applyCombinedFilters() {
  const checkedGroups = Array.from(
    document.querySelectorAll(".food-group-checkbox:checked")
  ).map((cb) => cb.value);

  const checkedCols = Array.from(
    document.querySelectorAll(".column-checkbox:checked")
  ).map((cb) => Number(cb.value));

  let filteredRows;
  if (
    checkedGroups.length === 0 ||
    checkedGroups.length ===
      document.querySelectorAll(".food-group-checkbox").length
  ) {
    filteredRows = allRows.slice();
  } else {
    filteredRows = [
      allRows[0],
      ...allRows.slice(1).filter((r) => checkedGroups.includes(r[2])),
    ];
  }

  const tableWrap = document.getElementById("table-wrap");
  tableWrap.innerHTML = "";
  if (!filteredRows.length) {
    tableWrap.textContent = "Sin datos.";
    return;
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const headTr = document.createElement("tr");
  for (let i = 0; i < filteredRows[0].length; i++) {
    if (i < 4 || checkedCols.includes(i)) {
      const th = document.createElement("th");
      th.textContent = filteredRows[0][i];
      headTr.appendChild(th);
    }
  }
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const r of filteredRows.slice(1)) {
    const tr = document.createElement("tr");
    for (let i = 0; i < r.length; i++) {
      if (i < 4 || checkedCols.includes(i)) {
        const td = document.createElement("td");
        td.textContent = r[i];
        tr.appendChild(td);
      }
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  tableWrap.appendChild(table);
}
