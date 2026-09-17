// Descarga la previsión de caudal a 30 días (control_forecast, la carrera
// determinista única — no el ensemble de 50 miembros, que sería mucho más
// pesado y no aporta a una animación simple) para España. Se piden en un
// solo job los últimos 7 días como fecha de referencia candidata (mismo
// truco que fetch-historico.js: la API ignora en silencio las que no
// existan) y luego, al decodificar, nos quedamos solo con la carrera de
// fecha de referencia más reciente que sí vino completa — así no hace falta
// saber de antemano qué día exacto está ya publicado.
import { aceptarLicencias, ejecutarYEsperar, descargarA } from "./lib/ewds.js";

const BBOX = [44, -10, 36, 4.5]; // [N,O,S,E]
const LEADTIMES = Array.from({ length: 30 }, (_, i) => String((i + 1) * 24)); // 24..720h, paso 24h
const DESTINO_BRUTO = "data/prevision.nc";

function ultimosDiasDelMes(n) {
  const hoy = new Date();
  const dias = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy);
    d.setUTCDate(hoy.getUTCDate() - i);
    if (d.getUTCMonth() === hoy.getUTCMonth()) dias.push(String(d.getUTCDate()).padStart(2, "0"));
  }
  return { anio: String(hoy.getUTCFullYear()), mes: String(hoy.getUTCMonth() + 1).padStart(2, "0"), dias };
}

async function main() {
  console.log("Aceptando licencias...");
  await aceptarLicencias("cems-glofas-forecast");

  const { anio, mes, dias } = ultimosDiasDelMes(2);
  console.log(`Solicitando previsión, carreras candidatas ${anio}-${mes}-[${dias.join(",")}], leadtime 24..720h...`);
  const href = await ejecutarYEsperar("cems-glofas-forecast", {
    system_version: ["operational"],
    hydrological_model: ["lisflood"],
    product_type: ["control_forecast"],
    variable: ["river_discharge_in_the_last_24_hours"],
    year: [anio],
    month: [mes],
    day: dias,
    leadtime_hour: LEADTIMES,
    data_format: "netcdf",
    download_format: "unarchived",
    area: BBOX,
  }, { onEstado: (e, id) => console.log(`  [${id}] ${e}`) });

  console.log("Descargando", href);
  const bytes = await descargarA(href, DESTINO_BRUTO);
  console.log(`Guardado ${DESTINO_BRUTO} (${(bytes / 1024).toFixed(0)} KB)`);
}

main().catch((err) => { console.error("ERROR:", err.message); process.exit(1); });
