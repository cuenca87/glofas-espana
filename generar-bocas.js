// Genera data/bocas_rio.json: la celda exacta de la rejilla GloFAS donde cada
// río principal de la península llega al mar, para poder leer ahí el caudal
// en cada frame de la animación (ver render-frames.js e index.html).
//
// Método: dentro de una caja lat/lon alrededor de cada desembocadura
// (coordenada aproximada, geografía de manual), nos quedamos con la celda de
// río de MAYOR uparea (cuenca de drenaje acumulada). Como uparea crece
// monótonamente aguas abajo, el máximo dentro de una caja que llegue hasta la
// costa es, por construcción, el punto más cercano al mar de esa caja — no
// hace falta que la celda "toque" literalmente una celda sin dato (mar):
// probado en vivo que el estuario del Tajo y la desembocadura del Júcar NO
// tienen un vecino directo marcado como mar en esta rejilla (el rasterizado
// del estuario/delta a 0.05° no deja una celda de tierra pegada a una de mar
// justo ahí), así que exigir esa condición los dejaba fuera.
//
// Se descartan los ríos cuya cuenca cae fuera de España (el recuadro pedido
// a la API cubre toda la península, así que con el criterio de "toca mar" de
// una versión anterior de este script aparecían también desembocaduras
// francesas como el Adour o portuguesas sin cabecera en España como el
// Mondego). Se incluyen Duero, Tajo y Guadiana pese a desembocar en
// Portugal: nacen y discurren gran parte de su curso por España.
import h5wasm from "h5wasm/node";
import { readFile, writeFile } from "node:fs/promises";

const LAT0 = 43.975, LON0 = -9.975, PASO = 0.05, FILAS = 160, COLS = 290;
const FILA_INICIO = 920, COL_INICIO = 3400;

// margen: medio-ancho de la caja de búsqueda en grados. La mayoría vale con
// 0.35°; el Tajo y el Júcar necesitan una caja algo mayor porque el punto de
// mayor uparea queda más lejos de la coordenada aproximada de la desembocadura
// (estuario/delta ancho).
const RIOS = [
  { nombre: "Miño", lat: 41.86, lon: -8.87, margen: 0.35 },
  { nombre: "Duero", lat: 41.14, lon: -8.68, margen: 0.35 },
  { nombre: "Tajo", lat: 38.68, lon: -9.10, margen: 0.5 },
  { nombre: "Guadiana", lat: 37.17, lon: -7.41, margen: 0.35 },
  { nombre: "Guadalquivir", lat: 36.79, lon: -6.35, margen: 0.35 },
  { nombre: "Segura", lat: 38.08, lon: -0.65, margen: 0.35 },
  { nombre: "Júcar", lat: 39.16, lon: -0.25, margen: 0.4 },
  // Margen pequeño a propósito: Turia (Valencia) y Júcar (Cullera) desembocan
  // solo ~0.3° al sur uno de otro — con un margen mayor, la caja de Turia
  // llegaba a incluir la celda de mucha más cuenca del Júcar y se quedaba
  // con esa por error (visto en vivo: ambos "enganchaban" a la misma celda).
  { nombre: "Turia", lat: 39.47, lon: -0.32, margen: 0.15 },
  { nombre: "Ebro", lat: 40.72, lon: 0.85, margen: 0.35 },
  { nombre: "Llobregat", lat: 41.32, lon: 2.10, margen: 0.35 },
  { nombre: "Nalón", lat: 43.56, lon: -6.06, margen: 0.35 },
];

async function main() {
  const mascara = JSON.parse(await readFile("data/mascara_rio.json", "utf8"));

  await h5wasm.ready;
  const f = new h5wasm.File("data/uparea_glofas.nc", "r");
  const uparea = f.get("uparea").slice([[FILA_INICIO, FILA_INICIO + FILAS], [COL_INICIO, COL_INICIO + COLS]]);
  f.close();

  const bocas = [];
  for (const rio of RIOS) {
    let mejor = null;
    for (let fila = 0; fila < FILAS; fila++) {
      const lat = LAT0 - fila * PASO;
      if (Math.abs(lat - rio.lat) > rio.margen) continue;
      for (let col = 0; col < COLS; col++) {
        const lon = LON0 + col * PASO;
        if (Math.abs(lon - rio.lon) > rio.margen) continue;
        const idx = fila * COLS + col;
        if (!mascara.celdas[idx]) continue;
        const u = uparea[idx] / 1e6;
        if (!mejor || u > mejor.u) mejor = { fila, col, lat, lon, u };
      }
    }
    if (!mejor) {
      console.warn(`[AVISO] No se encontró celda de río cerca de ${rio.nombre} (${rio.lat},${rio.lon})`);
      continue;
    }
    bocas.push({ nombre: rio.nombre, fila: mejor.fila, col: mejor.col, lat: mejor.lat, lon: mejor.lon, cuencaKm2: Math.round(mejor.u) });
    console.log(`${rio.nombre}: fila=${mejor.fila} col=${mejor.col} lat=${mejor.lat.toFixed(3)} lon=${mejor.lon.toFixed(3)} cuenca=${Math.round(mejor.u)} km²`);
  }

  await writeFile("data/bocas_rio.json", JSON.stringify(bocas, null, 2));
  console.log(`\nEscrito data/bocas_rio.json (${bocas.length} ríos)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
