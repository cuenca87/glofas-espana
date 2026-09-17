// Cliente mínimo para la API REST "nueva generación" (OGC API - Processes) de
// EWDS (Early Warning Data Store, ewds.climate.copernicus.eu) — el portal de
// Copernicus específico para EFAS/GloFAS, hermano de CDS pero con su propio
// catálogo de datasets (GloFAS no existe en cds.climate.copernicus.eu).
//
// Flujo validado en vivo: auth por cabecera PRIVATE-TOKEN -> aceptar las
// licencias requeridas (una genérica "terms-of-use-cems" y otra específica
// del dataset, p.ej. "cems-floods") -> POST de ejecución (devuelve jobID al
// momento, 201, aunque el proceso real tarda) -> GET de estado en bucle
// (accepted -> running -> successful/failed, ~70-80s de cola mínima por job
// SEA CUAL SEA el volumen de datos pedido — de ahí que compense agrupar
// muchas fechas en una sola petición en vez de una petición por fecha) ->
// GET de resultados (da la URL de descarga directa).
import { readFile } from "node:fs/promises";

async function credenciales() {
  if (process.env.EWDS_URL && process.env.EWDS_KEY) {
    return { url: process.env.EWDS_URL, key: process.env.EWDS_KEY };
  }
  return JSON.parse(await readFile("credenciales.json", "utf8"));
}

async function peticion(ruta, opciones = {}) {
  const { url, key } = await credenciales();
  const resp = await fetch(`${url}${ruta}`, {
    ...opciones,
    headers: {
      "PRIVATE-TOKEN": key,
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...opciones.headers,
    },
  });
  const texto = await resp.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  if (!resp.ok) {
    const detalle = typeof cuerpo === "object" ? JSON.stringify(cuerpo) : cuerpo;
    throw new Error(`${opciones.method || "GET"} ${ruta} -> ${resp.status}: ${detalle}`);
  }
  return cuerpo;
}

// Acepta (si hace falta) todas las licencias que exija un dataset. Se llama
// antes de cada ejecución porque es barato (si ya está aceptada, PUT vuelve
// a devolver 200/201 sin problema) y evita tener que mantener a mano la
// lista de licencias ya aceptadas.
export async function aceptarLicencias(datasetId) {
  // Licencia genérica de CEMS, exigida por todos los datasets de este
  // catálogo (no aparece en los metadatos del dataset, hay que aceptarla
  // aparte). Revisión confirmada en vivo: 11.
  await peticion("/profiles/v1/account/licences/terms-of-use-cems", {
    method: "PUT",
    body: JSON.stringify({ revision: 11 }),
  }).catch(() => {}); // si ya está aceptada o la revisión cambió, no bloquea

  const meta = await peticion(`/catalogue/v1/collections/${datasetId}`);
  const licencias = (meta.links || []).filter((l) => l.rel === "license");
  for (const lic of licencias) {
    const rev = lic.rev ?? 1;
    await peticion(`/profiles/v1/account/licences/${lic.id}`, {
      method: "PUT",
      body: JSON.stringify({ revision: rev }),
    });
  }
}

// Envía la petición y espera (con reintentos de sondeo) a que el job termine.
// Devuelve la URL de descarga directa del resultado.
export async function ejecutarYEsperar(datasetId, inputs, { onEstado } = {}) {
  const envio = await peticion(`/retrieve/v1/processes/${datasetId}/execution`, {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
  const jobId = envio.jobID;
  if (!jobId) throw new Error(`Sin jobID en la respuesta: ${JSON.stringify(envio)}`);

  let estado = envio.status || "accepted";
  while (estado === "accepted" || estado === "running") {
    onEstado?.(estado, jobId);
    await new Promise((r) => setTimeout(r, 5000));
    const consulta = await peticion(`/retrieve/v1/jobs/${jobId}`);
    estado = consulta.status;
  }
  if (estado !== "successful") {
    throw new Error(`Job ${jobId} terminó en estado "${estado}"`);
  }
  const resultados = await peticion(`/retrieve/v1/jobs/${jobId}/results`);
  const href = resultados?.asset?.value?.href;
  if (!href) throw new Error(`Sin URL de descarga en los resultados: ${JSON.stringify(resultados)}`);
  return href;
}

export async function descargarA(urlDescarga, destino) {
  const resp = await fetch(urlDescarga);
  if (!resp.ok) throw new Error(`Descarga falló: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, buf);
  return buf.length;
}
