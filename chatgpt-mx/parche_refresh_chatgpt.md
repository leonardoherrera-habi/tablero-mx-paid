# Parche propuesto para `automation/refresh.js`

No aplicado. Revisar antes de tocar el archivo que ya funciona.

## Qué hace

Lee el gasto de ChatGPT Ads desde una hoja de Google y agrega esas filas al
`data.json`, con la misma forma que produce `query.sql`. No toca BigQuery.

## Por qué aquí y no en `query.sql`

El gasto de ChatGPT nunca va a estar en `resumen_inversiones_mkt_mx`: no hay
conector y la cuenta no tiene permiso de escritura en ningún dataset. Cambiar el
filtro `plataforma IN ('Google','Facebook','Bing')` no dejaría entrar nada porque
no hay filas que dejar entrar.

Cuando exista el conector, sí habrá que agregar `'Chatgpt'` a ese `IN` y entonces
este parche se retira. Mientras tanto, la hoja es el puente.

## Las dos decisiones que importan

**1. La moneda.** La hoja trae PESOS. El `data.json` trae DÓLARES, porque
`resumen_inversiones_mkt_mx` está en dólares (Facebook: 7.230 de gasto contra
19.834 clics el 10-sep = 0,36 por clic; en pesos serían 2 centavos de dólar).

Si se mezclan sin convertir, los CPL salen creíbles y falsos. Por eso la hoja
lleva una columna `tipo_cambio` y la conversión queda explícita y auditable.

**2. Fallar visible, no en silencio.** Si la hoja no carga, el refresh NO debe
abortar —dejaría de actualizarse todo el tablero por una fuente auxiliar— pero
tampoco debe seguir como si nada. Por eso escribe un bloque `_meta` que el HTML
lee para mostrar una advertencia cuando el gasto está viejo.

## Estructura de la hoja

Pestaña única, encabezados en la fila 1:

| fecha | spend_mxn | clicks | impressions | tipo_cambio |
|---|---|---|---|---|
| 2026-09-09 | 633.50 | 37 | 3870 | 18.45 |
| 2026-09-10 | 688.00 | 41 | 4120 | 18.45 |

La hoja debe ser legible con el enlace ("cualquiera con el enlace puede ver"),
igual que la de ask price. Si no, Google devuelve HTML de login en vez de CSV.

## El código

```js
// ---------------------------------------------------------------------
// Gasto de ChatGPT Ads. Viene de una hoja porque no hay conector ni
// permiso de escritura en BigQuery. Ver chatgpt-mx/parche_refresh_chatgpt.md
// ---------------------------------------------------------------------
const CHATGPT_SHEET_ID  = 'PENDIENTE';
const CHATGPT_SHEET_GID = '0';
const CHATGPT_CMP       = 'Tuhabi_Chatgpt_Conversiones_MX_Nacional';

async function fetchChatgptSpend() {
  const url = `https://docs.google.com/spreadsheets/d/${CHATGPT_SHEET_ID}` +
              `/export?format=csv&gid=${CHATGPT_SHEET_GID}`;

  // Timeout explicito: un fetch colgado dejaria el refresh esperando en silencio.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let text;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // Google devuelve la pagina de login si la hoja no es publica.
  if (/^\s*</.test(text)) {
    throw new Error('la hoja no es publica (llego HTML, no CSV)');
  }

  const lines = text.trim().split(/\r?\n/);
  const head  = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx   = n => head.indexOf(n);
  for (const req of ['fecha', 'spend_mxn', 'tipo_cambio']) {
    if (idx(req) === -1) throw new Error(`falta la columna "${req}" en la hoja`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c  = lines[i].split(',').map(v => v.trim());
    const fx = parseFloat(c[idx('tipo_cambio')]);
    const mxn = parseFloat(c[idx('spend_mxn')]);
    if (!c[idx('fecha')] || !isFinite(fx) || fx <= 0 || !isFinite(mxn)) continue;

    rows.push({
      d: c[idx('fecha')],
      fid: 3,                 // WEB, igual que mkt_channel_big en el diccionario
      pl: 'Chatgpt',          // mismo casing que el diccionario UTM
      cmp: CHATGPT_CMP,
      sub: 'WEB Paid',
      imp: parseInt(c[idx('impressions')] || '0', 10) || 0,
      clk: parseInt(c[idx('clicks')]      || '0', 10) || 0,
      spend: Math.round((mxn / fx) * 100) / 100,   // <-- a dolares
      cre: 0, cal: 0, asg: 0, cit: 0, cie: 0,
    });
  }
  return rows;
}
```

Y en `main()`, despues de `processRows`:

```js
let filas = processRows(raw);

let metaChatgpt = { ok: false, filas: 0, error: null, actualizado: null };
try {
  const gasto = await fetchChatgptSpend();
  filas = filas.concat(gasto);
  metaChatgpt = {
    ok: true,
    filas: gasto.length,
    error: null,
    actualizado: gasto.length ? gasto[gasto.length - 1].d : null,
  };
  log(`Gasto ChatGPT: ${gasto.length} dias`);
} catch (e) {
  // No abortamos: una fuente auxiliar no debe tumbar todo el refresh.
  // Pero queda registrado para que el HTML lo muestre.
  metaChatgpt.error = String(e.message || e);
  log(`AVISO - gasto ChatGPT no cargo: ${metaChatgpt.error}`);
}

fs.writeFileSync(DATA_PATH, JSON.stringify({
  filas,
  _meta: { generado: new Date().toISOString(), chatgpt: metaChatgpt },
}));
```

## Ojo: cambia la forma de `data.json`

Hoy `data.json` es probablemente un arreglo plano. Envolverlo en
`{ filas, _meta }` **rompe `index.html`**, que hace
`fetch('data.json').then(r => r.json())` y espera el arreglo.

Dos salidas:

- **Conservadora:** dejar `data.json` como arreglo y escribir el `_meta` en un
  archivo aparte, `data_meta.json`. No toca nada de lo que ya funciona.
- **Limpia:** envolver y ajustar `index.html` para leer `d.filas ?? d`. Aguanta
  las dos formas, asi que se puede desplegar en cualquier orden.

Recomendada: la conservadora, mientras el tablero de ask price siga en uso.

## Verificacion despues de aplicar

```bash
cd automation && npm run refresh:headed
```

Revisar en `data.json` que aparezcan filas con `"pl":"Chatgpt"` y que el `spend`
este en el orden de magnitud correcto: unos 35 dolares por dia, no 650.
Si sale 650, la conversion no se aplico.
