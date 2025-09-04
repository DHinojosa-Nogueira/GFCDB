const FILE_PATH = "./data/Data.xlsx";
const SHEET_NAME = "Index";

const statusEl = document.getElementById("status");
const wrap = document.getElementById("wrap");
const titleEl = document.getElementById("title");
const authorsEl = document.getElementById("authors");

document.addEventListener("DOMContentLoaded", () => {
  loadXlsx();
});

async function loadXlsx() {
  try {
    // 1) Verificar SheetJS
    if (typeof XLSX === "undefined") {
      throw new Error(
        "SheetJS no se cargó. Revisa la etiqueta <script> del CDN."
      );
    }

    // 2) Cargar archivo (requiere servidor HTTP, no abrir como file://)
    const res = await fetch(FILE_PATH);
    if (!res.ok)
      throw new Error(`No se pudo cargar ${FILE_PATH} (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();

    const lastModified = res.headers.get("Last-Modified");

    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    const name = SHEET_NAME || wb.SheetNames[0];
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`No existe la hoja "${name}" en el libro.`);

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    if (!rows.length) throw new Error("La hoja está vacía.");
    const title = rows[1][0] || "";
    const authors = rows[1][1] || "";
    const updated = rows[1][2] || "";

    if (titleEl) titleEl.textContent = title;
    if (authorsEl) authorsEl.textContent = authors;
    document.getElementById("fecha1").textContent = "Last update: " + updated;
    document.getElementById("fecha2").textContent = "Last update: " + updated;

    // Limpia estado si todo fue bien
    if (statusEl) {
      statusEl.classList.remove("error");
      statusEl.textContent = "";
    }
  } catch (err) {
    if (statusEl) {
      statusEl.classList.add("error");
      statusEl.textContent = `Error: ${err.message}`;
    }
    if (wrap) wrap.innerHTML = "";
    console.error(err);
  }
}
