// Genera la máscara "esta celda de la rejilla GloFAS (0.05°, 160x290 sobre
// España) es cauce real" a partir del fichero auxiliar oficial de GloFAS
// "upstream area" (uparea_glofas_v4_0.nc, descarga estática de ECMWF
// Confluence — mismo origen/paso que la rejilla de descarga de caudal, ya
// verificado por índice). Es el criterio estándar de LISFLOOD/GloFAS para
// distinguir cauce de ladera: una celda solo acumula área de drenaje grande
// si de verdad es parte de la red de canales, así que un umbral simple en
// km² traza la red fluvial real sin necesitar ninguna geometría de ríos
// aparte.
//
// Se probó antes cruzar por vértice con la red Pfafstetter (330.000 tramos)
// del proyecto de incendios, pero marcaba el 46% de las celdas — demasiado
// denso para distinguir "río" de "no río" en el mapa. Con uparea y umbral
// 1000 km² (elegido tras comparar 250/500/1000/2000 km² pintando la máscara
// como PNG y comprobando a simple vista qué umbral traza el Duero, Tajo,
// Ebro, Guadiana y Guadalquivir de forma reconocible sin quedar ni disperso
// ni como una mancha) se marca solo ~9% de las celdas y el resultado
// reproduce la red fluvial real.
import h5wasm from "h5wasm/node";
import { writeFile } from "node:fs/promises";

const RUTA_UPAREA = "data/uparea_glofas.nc";
const UMBRAL_KM2 = 1000;

// Misma rejilla que devuelve la API de GloFAS para el área pedida (España
// peninsular+Baleares): confirmado en vivo, lat 43.975..36.025 / lon
// -9.975..4.475, paso 0.05°, 160 filas x 290 columnas. En el fichero global
// de uparea (3000x7200, lat 89.975..-59.975, lon -179.975..179.975, mismo
// paso) esto corresponde a las filas 920-1079 y columnas 3400-3689.
const LAT0 = 43.975, LON0 = -9.975, PASO = 0.05, FILAS = 160, COLS = 290;
const FILA_INICIO = 920, COL_INICIO = 3400;

async function main() {
  await h5wasm.ready;
  const f = new h5wasm.File(RUTA_UPAREA, "r");
  const uparea = f.get("uparea").slice([[FILA_INICIO, FILA_INICIO + FILAS], [COL_INICIO, COL_INICIO + COLS]]);
  f.close();

  const mascara = new Uint8Array(FILAS * COLS);
  let marcadas = 0;
  for (let i = 0; i < uparea.length; i++) {
    const v = uparea[i];
    if (v < -1e37) continue; // nodata/mar
    if (v / 1e6 >= UMBRAL_KM2) { mascara[i] = 1; marcadas++; }
  }
  console.log(`${marcadas} de ${FILAS * COLS} celdas marcadas como río (${(marcadas / (FILAS * COLS) * 100).toFixed(1)}%), umbral ${UMBRAL_KM2} km²`);

  await writeFile("data/mascara_rio.json", JSON.stringify({
    filas: FILAS, cols: COLS, lat0: LAT0, lon0: LON0, paso: PASO, umbralKm2: UMBRAL_KM2,
    celdas: Array.from(mascara),
  }));
  console.log("Escrito data/mascara_rio.json");
}

main().catch((err) => { console.error(err); process.exit(1); });
