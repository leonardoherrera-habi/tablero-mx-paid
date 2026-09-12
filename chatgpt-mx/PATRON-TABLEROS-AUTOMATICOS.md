# Cómo se hacen automáticos los tableros de este repo

Notas tomadas leyendo los tableros de ask price (2026-09-09). Sirven de plantilla
para cualquier tablero nuevo, incluido el de ChatGPT Ads.

## Los dos patrones que ya funcionan aquí

### Patrón A — el HTML lee la hoja directo

`ask_price_dashboard_v2.html`, `_final`, `_completo`, `dashboard_final.html`.

```js
const exportUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const gviz      = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
setInterval(loadData, 5 * 60 * 1000);
```

Sin backend, sin build. El HTML se abre desde cualquier lado y se refresca solo
cada 5 minutos.

**Requisito duro:** la hoja tiene que ser legible sin login ("cualquiera con el
enlace"). Si no, Google devuelve HTML de login en vez de CSV. Los datos quedan
accesibles para quien tenga la URL — decisión consciente, no accidente.

Tres detalles del `v2` que vale la pena copiar siempre, porque son los que
evitan que el tablero mienta:

1. `AbortController` con timeout de 20 s. Un `fetch` sin timeout se cuelga en
   silencio y el tablero se queda con datos viejos sin avisar.
2. Detección de respuesta no-CSV: `if (/^\s*</.test(text)) throw ...`. Así se
   distingue "hoja no pública" de "hoja vacía".
3. `gviz` como respaldo de `export`, y sólo se acepta el resultado si trae filas
   con fecha. Si los dos fallan, el estado en pantalla dice por qué.

### Patrón B — un job regenera `data.json` y el HTML lo lee

`index.html` + `.github/workflows/update-mx-paid.yml` + `automation/refresh.js`.

```js
const res = await fetch('data.json?_=' + Date.now());   // cache-bust
```

El workflow corre `cron: "0 14 * * *"`, baja el `data.json` y lo commitea.
Aguanta datos más pesados y deja histórico versionado en git.

## El hallazgo que condiciona todo

Del `automation/README.md`, textual:

> la org Habi bloquea Drive scope para gcloud CLI, lo que hace imposible que un
> Service Account lea el UTM dict (tabla externa sobre Sheets)

Por eso existe `refresh.js`: abre BQ Studio con Playwright, captura el
`Authorization: Bearer` del navegador y con ese token pega a la REST API de
BigQuery. Es un rodeo elaborado para un problema de permisos.

**Consecuencia para cualquier tablero nuevo:** todo lo que toque
`registro_unico_utm_mkt_mexico` hereda ese problema, porque es una EXTERNAL TABLE
sobre Google Sheets. Un service account no la puede leer. Antes de meter ese
JOIN, preguntarse si de verdad hace falta.

Para el tablero de ChatGPT no hace falta: es una sola campaña y sus etiquetas son
constantes conocidas (WEB / WEB Paid / Paid / Chatgpt). Se resuelven con un CASE
y el tablero deja de depender de Drive por completo.

## Qué patrón elegir

| Situación | Patrón |
|---|---|
| Pocos datos, se quiere simple, la hoja puede ser pública | A |
| Datos pesados, o no pueden ser públicos, o se quiere histórico en git | B |
| El dato vive en BigQuery y debe cruzar tablas externas sobre Sheets | B, y con el rodeo de `refresh.js` |

## Limitaciones heredadas, en voz alta

- El Patrón B con `refresh.js` **depende de que la laptop esté prendida** a la
  hora del Task Scheduler. Está escrito en el README y sigue siendo cierto.
- La sesión capturada por Playwright expira (~14 días). El síntoma es
  `No se capturó access_token` o `BQ API 401`.
- `query.sql` usa `CURRENT_DATE()` en UTC. Corriendo después de las ~6 PM hora de
  México trae datos parciales del día. Para corte estricto MX:
  `CURRENT_DATE('America/Mexico_City')`.
