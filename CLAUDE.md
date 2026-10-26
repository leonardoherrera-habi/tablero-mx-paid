# tablero-mx-paid — contexto del repositorio

Tableros de marketing de Habi México, publicados en GitHub Pages.
Portada (repositorio aparte): https://leonardoherrera-habi.github.io/

Para el modelo de datos completo —mapa de tablas, llaves de cruce, trampas y
benchmarks— usa la skill **`habi-data-mx`**. Este archivo cubre sólo lo propio
del repositorio.

## Qué hay aquí

| tablero | archivo | estado |
|---|---|---|
| MX Paid Media | `index.html` + hoja de Google (respaldo: `data.json`) | migrado a Apps Script el 21-oct-2026; vivo cuando la hoja esté instalada (ver abajo) |
| ChatGPT Ads MX | `chatgpt-mx/index.html` | vivo, se actualiza solo cada 3 h |
| Ask Price | `ask_price_dashboard_v2.html` | vivo, lee una hoja cada 5 min |

Los demás `ask_price_dashboard_*.html` son versiones anteriores. Ojo con
`ask_price_dashboard_automatico.html`: pese al nombre, **no** se actualiza solo
—lee un `data.csv` local—; el que sí es automático es el `_v2`.

## Cómo consultar BigQuery desde aquí

El CLI de `bq` no conecta en esta máquina. Usa `chatgpt-mx/bqq.sh`, que va por la
API REST. Requiere `dangerouslyDisableSandbox` porque el sandbox bloquea la red.
Los detalles están en la skill.

## Los dos patrones de actualización automática

Documentados en `chatgpt-mx/PATRON-TABLEROS-AUTOMATICOS.md`.

**Apps Script + hoja de Google** — el del tablero de ChatGPT. Un script con
disparador cada 3 horas consulta BigQuery (o la API de OpenAI) y escribe una
hoja; el HTML la lee por CSV. Corre en servidores de Google. Es el patrón a usar
por defecto para cualquier tablero nuevo.

**Playwright local** — `automation/refresh.js`. Existe sólo porque la
organización bloquea el scope de Drive para cuentas de servicio, lo que impide
que un pipeline lea el diccionario UTM. Depende de que la laptop esté prendida y
su sesión expira cada ~14 días. Si la consulta no toca el diccionario, no hace
falta.

## Pendientes conocidos

**El tablero de MX Paid estuvo congelado del 13-jun al 21-oct-2026.** El GitHub
Action sólo copiaba un `data.json` que otro proceso (fuera de este repo) dejaba en
Drive, y ese proceso dejó de correr. Se migró a
`automation/AppsScript_mx_paid.gs`: lee el diccionario UTM directo de la hoja
(SpreadsheetApp) y se lo pasa a BigQuery como parámetro JSON, así que ya no
depende de la tabla externa sobre Sheets ni del scope de Drive. Escribe la hoja
cada 3 h; `index.html` la lee por CSV y avisa en pantalla si los datos tienen más
de 8 h. Instalación en el encabezado del `.gs`. Hasta que se llenen `SHEET_ID` y
`GID_META` en `index.html`, el tablero cae al `data.json` viejo y lo marca como
desactualizado. **Revisa siempre la frescura del pipeline antes de dudar de los
datos.**

Desde el 21-oct-2026 los **asignados salen del WBR mart**
(`sellers_leads_asignados_marketing_wbr_mart`), no de `fecha_primer_asignacion`
de la TIG, que cuenta cualquier asignación e inflaba WEB ~50%. Brand cuenta como
WEB. Así cuadra con el Planning 2026 Oficial de Camilo (pestañas "MX Query
Leads", "MX Query $", "MX Motor"; ojo: "MX Inversion" es inversión en miles de
MXN, no asignados): la inversión cuadra al dólar.

Desde el 26-oct-2026 **los dos tableros (MX Paid y ChatGPT) cuentan cada etapa
el día en que ocurrió**, como el WBR: creados por fecha de creación, calificados
por `fecha_primer_calificacion`, asignados por el `dia` del mart, citas por
`fecha_cita_agendada` y cierres por la fecha de `seguimiento_funnel_mex`
('Cierre - Comprado'), no por `fecha_cierre` de la TIG. Cada evento conserva el
canal y la campaña del lead. Por eso un cociente del mismo día (calificados ÷
creados) ya no es la conversión exacta de esos leads. Antes todo iba por cohorte
de creación y las semanas recientes salían casi sin cierres.

El `data.json` viejo usaba otro universo de leads: el 10-jun-2026 traía 335
creados, contra 414 (fuentes 3 + 7 + 47) de la lógica de `query.sql`, que es la
que usa ahora el tablero. La inversión sí cuadra al centavo.

~~Google no reporta inversión desde el 1 de septiembre de 2026.~~ Resuelto: al
21-oct-2026 `resumen_inversiones_mkt_mx` trae Google hasta el día anterior.

**Falta integrar SAC** al tablero de MX Paid. Las campañas con `-org-sac-` en
`campana_mercadeo` dejaron de etiquetarse el 25 de agosto de 2026.

**Y hay archivos con pinta de credencial en `.github/workflows/`** sin trackear
(`EAAJ....txt`, prefijo de token de Meta). Un `git add .` los publicaría en un
repositorio con Pages público. Conviene moverlos fuera y rotar lo que sea real.

## Convenciones

Los commits van en español. El `data.json` del tablero de MX Paid es un objeto
`{generado_utc, registros, data}`, no un arreglo plano — `index.html` espera esa
forma, así que envolverlo distinto lo rompe.
