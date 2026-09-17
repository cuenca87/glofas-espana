// Decodifica un NetCDF de caudal GloFAS (histórico o previsión, mismo formato
// [tiempo, lat, lon]) y genera un PNG por fecha/hora (coloreado, enmascarado
// a solo celdas de río — ver generar-mascara-rio.js) + un manifiesto JSON,
// mismo patrón que arome/render-frames.js para poder reusar el reproductor.
//
// Escala de color FIJA en m³/s (no normalizada por frame): así los colores
// son comparables entre fechas — un tramo en rojo siempre significa "caudal
// alto" sea cual sea la fecha, en vez de recalibrarse frame a frame y que
// "rojo" no signifique lo mismo en verano que en avenida. Paradas elegidas a
// partir de la distribución real de la serie 2024-2026 (mediana ~26 m³/s,
// p90 ~270, máximo observado en el periodo ~7400 m³/s en una avenida de
// 2026-02-09) — azul claro en caudal bajo/normal, virando a rojo/magenta en
// caudales de avenida.
import h5wasm from "h5wasm/node";
import { PNG } from "pngjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const PARADAS_CAUDAL = [
  { t: 0, color: [200, 225, 245], a: 160 },
  { t: 2, color: [150, 200, 235], a: 190 },
  { t: 10, color: [90, 165, 225], a: 215 },
  { t: 50, color: [40, 120, 200], a: 235 },
  { t: 200, color: [60, 80, 170], a: 245 },
  { t: 800, color: [130, 50, 160], a: 250 },
  { t: 3000, color: [200, 30, 90], a: 255 },
  { t: 8000, color: [230, 20, 30], a: 255 },
];

function colorEnRampa(v, paradas) {
  if (v <= paradas[0].t) return [...paradas[0].color, paradas[0].a ?? 255];
  const ultima = paradas[paradas.length - 1];
  if (v >= ultima.t) return [...ultima.color, ultima.a ?? 255];
  for (let i = 0; i < paradas.length - 1; i++) {
    const a = paradas[i];
    const b = paradas[i + 1];
    if (v >= a.t && v <= b.t) {
      const f = (v - a.t) / (b.t - a.t);
      const alfaA = a.a ?? 255, alfaB = b.a ?? 255;
      return [
        Math.round(a.color[0] + (b.color[0] - a.color[0]) * f),
        Math.round(a.color[1] + (b.color[1] - a.color[1]) * f),
        Math.round(a.color[2] + (b.color[2] - a.color[2]) * f),
        Math.round(alfaA + (alfaB - alfaA) * f),
      ];
    }
  }
  return [...ultima.color, ultima.a ?? 255];
}

const ESCALA = 3; // cada celda de rejilla (0.05°) se pinta como bloque de ESCALA x ESCALA px

async function main() {
  const modo = process.argv[2]; // "historico" o "prevision"
  // El histórico (cems-glofas-historical) usa la variable "avg_dis" con forma
  // [tiempo, lat, lon]; la previsión (cems-glofas-forecast) usa "dis24" con
  // forma [leadtime, forecast_reference_time=1, lat, lon] — un eje de más
  // porque en teoría cabrían varias carreras a la vez, aunque aquí solo pedimos
  // una (ver fetch-prevision.js).
  const config = {
    historico: { entrada: "data/historico.nc", salida: "data/png_historico", variable: "avg_dis", ejeExtra: false },
    prevision: { entrada: "data/prevision.nc", salida: "data/png_prevision", variable: "dis24", ejeExtra: true },
  }[modo];
  if (!config) {
    console.error('Uso: node render-frames.js historico|prevision');
    process.exit(1);
  }

  const mascara = JSON.parse(await readFile("data/mascara_rio.json", "utf8"));
  const { filas: FILAS, cols: COLS, lat0: LAT0, lon0: LON0, paso: PASO } = mascara;

  await h5wasm.ready;
  const f = new h5wasm.File(config.entrada, "r");
  const dis = f.get(config.variable);
  const T = dis.shape[0];
  const vt = Array.from(f.get("valid_time").value).map((s) => Number(s));

  await mkdir(config.salida, { recursive: true });

  const frames = [];
  for (let t = 0; t < T; t++) {
    const rango = config.ejeExtra ? [[t, t + 1], [0, 1], [0, FILAS], [0, COLS]] : [[t, t + 1], [0, FILAS], [0, COLS]];
    const frameData = f.get(config.variable).slice(rango);

    const fechaISO = new Date(vt[t] * 1000).toISOString();
    const png = new PNG({ width: COLS * ESCALA, height: FILAS * ESCALA });
    let min = Infinity, max = -Infinity;
    for (let fila = 0; fila < FILAS; fila++) {
      for (let col = 0; col < COLS; col++) {
        const idxCelda = fila * COLS + col;
        let r = 0, g = 0, b = 0, a = 0;
        if (mascara.celdas[idxCelda]) {
          const v = frameData[idxCelda];
          if (v < 1e30) {
            if (v < min) min = v;
            if (v > max) max = v;
            [r, g, b, a] = colorEnRampa(v, PARADAS_CAUDAL);
          }
        }
        for (let dy = 0; dy < ESCALA; dy++) {
          for (let dx = 0; dx < ESCALA; dx++) {
            const x = col * ESCALA + dx, y = fila * ESCALA + dy;
            const idxPng = (COLS * ESCALA * y + x) << 2;
            png.data[idxPng] = r; png.data[idxPng + 1] = g; png.data[idxPng + 2] = b; png.data[idxPng + 3] = a;
          }
        }
      }
    }
    if (!Number.isFinite(min)) { min = 0; max = 0; }

    const nombrePng = `f${String(t).padStart(3, "0")}.png`;
    await writeFile(`${config.salida}/${nombrePng}`, PNG.sync.write(png));
    frames.push({ fecha: fechaISO, archivo: nombrePng, min: Number(min.toFixed(1)), max: Number(max.toFixed(1)) });
    console.log(`  [ok] ${fechaISO.slice(0, 10)} -> ${nombrePng} (${min.toFixed(1)}..${max.toFixed(1)} m³/s)`);
  }

  await writeFile(`${config.salida}/manifiesto.json`, JSON.stringify({
    unidad: "m³/s",
    bbox: [LON0, LAT0 - FILAS * PASO, LON0 + COLS * PASO, LAT0], // [O,S,E,N]
    filas: FILAS, cols: COLS,
    paradasColor: PARADAS_CAUDAL,
    frames,
  }, null, 2));

  f.close();
  console.log(`\n${frames.length} frames en ${config.salida}/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
