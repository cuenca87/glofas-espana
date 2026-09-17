// Descarga en UN solo job (agrupando fechas, ver lib/ewds.js) la serie
// histórica de caudal medio diario sobre España para ~2.5 años a resolución
// aprox. semanal (día 01/08/15/22 de cada mes = 4 muestras/mes). Un job
// agrupado tarda lo mismo (~70-90s de cola) que uno de un solo día, así que
// merece la pena pedir todo junto en vez de un job por fecha.
//
// La API ignora en silencio las combinaciones año/mes/día que no tengan
// datos todavía (comprobado en vivo: pedir fechas futuras no da error, solo
// vienen menos entradas en valid_time de las pedidas) — por eso se puede
// pedir hasta el año en curso sin tener que averiguar antes cuál es la
// última fecha "consolidated" disponible (a fecha de esta prueba, ~3 meses
// de retraso respecto a hoy).
import { aceptarLicencias, ejecutarYEsperar, descargarA } from "./lib/ewds.js";

const BBOX = [44, -10, 36, 4.5]; // [N,O,S,E] — España peninsular + Baleares
const ANIOS = ["2024", "2025", "2026"];
const DESTINO = "data/historico.nc";

async function main() {
  console.log("Aceptando licencias...");
  await aceptarLicencias("cems-glofas-historical");

  console.log(`Solicitando histórico ${ANIOS.join("/")}, día 01/08/15/22 de cada mes...`);
  const href = await ejecutarYEsperar("cems-glofas-historical", {
    system_version: ["version_4_0"],
    hydrological_model: ["lisflood"],
    product_type: ["consolidated"],
    timespan: ["time_mean"],
    variable: ["average_river_discharge_in_the_last_24_hours"],
    year: ANIOS,
    month: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
    day: ["01", "08", "15", "22"],
    data_format: "netcdf",
    download_format: "unarchived",
    area: BBOX,
  }, { onEstado: (e, id) => console.log(`  [${id}] ${e}`) });

  console.log("Descargando", href);
  const bytes = await descargarA(href, DESTINO);
  console.log(`Guardado ${DESTINO} (${(bytes / 1024).toFixed(0)} KB)`);
}

main().catch((err) => { console.error("ERROR:", err.message); process.exit(1); });
