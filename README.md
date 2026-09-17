# GloFAS España

Animación del caudal de los ríos de España (península + Baleares) a partir del
[Global Flood Awareness System](https://global-flood.emergency.copernicus.eu/)
(GloFAS, Copernicus Emergency Management Service): evolución histórica
(2024-hoy, resolución semanal) y previsión a 30 días.

## Cómo funciona

- Datos descargados de la API EWDS (`ewds.climate.copernicus.eu`), datasets
  `cems-glofas-historical` y `cems-glofas-forecast` (`lib/ewds.js`).
- El caudal en bruto de LISFLOOD tiene valores no nulos en casi toda la
  superficie de España (escorrentía de ladera, no solo cauces), así que se
  enmascara a la red fluvial real con el fichero auxiliar oficial de GloFAS
  "upstream area" (celdas con cuenca de drenaje ≥1000 km², ver
  `generar-mascara-rio.js`).
- `render-frames.js` decodifica el NetCDF (vía `h5wasm`) y genera un PNG por
  fecha con una rampa de color fija en m³/s (comparable entre fechas) +
  `manifiesto.json`. También lee `data/bocas_rio.json` (generado una vez por
  `generar-bocas.js`, la celda de mayor cuenca cerca de la desembocadura de
  cada río principal) y guarda el caudal ahí en cada fecha, para las
  etiquetas del visor.
- `index.html`: visor Leaflet con reproductor (play/pausa/velocidad/scrubber),
  pestañas histórico/previsión — `?p=historico` o `?p=prevision`.
- `.github/workflows/actualizar.yml`: refresca la previsión a diario y el
  histórico semanalmente (el producto "consolidated" tarda meses en
  consolidarse, así que no hay nada nuevo que pedir más a menudo).

## Desarrollo local

```
npm install
echo '{"url":"https://ewds.climate.copernicus.eu/api","key":"TU_CLAVE"}' > credenciales.json
node fetch-historico.js && node render-frames.js historico
node fetch-prevision.js && node render-frames.js prevision
```

La clave se obtiene creando una cuenta en
[ewds.climate.copernicus.eu](https://ewds.climate.copernicus.eu/) (perfil de
usuario → API key). `credenciales.json` nunca se sube al repo (ver
`.gitignore`); en GitHub Actions se usa como secretos `EWDS_URL`/`EWDS_KEY`.

## Pendiente

Los "reporting points" de GloFAS (~2903 puntos fijos de alerta por umbral de
retorno 2/5/20 años) no están disponibles por esta misma API — solo por login
web en el visor de Copernicus. Aparcado por ahora.
