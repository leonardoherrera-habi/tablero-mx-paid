# tablero-mx-paid — contexto del repositorio

Tableros de marketing de Habi México, publicados en GitHub Pages.
Portada (repositorio aparte): https://leonardoherrera-habi.github.io/

Para el modelo de datos completo —mapa de tablas, llaves de cruce, trampas y
benchmarks— usa la skill **`habi-data-mx`**. Este archivo cubre sólo lo propio
del repositorio.

## Qué hay aquí

| tablero | archivo | estado |
|---|---|---|
| MX Paid Media | `index.html` + `data.json` | **congelado desde el 13-jun-2026** |
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

**El tablero de MX Paid lleva congelado desde el 13 de junio de 2026.** Su
`data.json` no se actualiza: el GitHub Action dejó de correr y `refresh.js`
nunca llegó a commitear (su formato de mensaje no aparece en el historial). Esto
ha hecho parecer varias veces que campañas nuevas "no están cayendo" cuando en
BigQuery estaban perfectas. **Revisa siempre la frescura del pipeline antes de
dudar de los datos.**

**Google no reporta inversión desde el 1 de septiembre de 2026** en
`resumen_inversiones_mkt_mx` — cero filas, no filas en cero. Coincide con la
revocación de accesos de ciberseguridad de ese día.

**Falta integrar SAC** al tablero de MX Paid. Las campañas con `-org-sac-` en
`campana_mercadeo` dejaron de etiquetarse el 25 de agosto de 2026.

**Y hay archivos con pinta de credencial en `.github/workflows/`** sin trackear
(`EAAJ....txt`, prefijo de token de Meta). Un `git add .` los publicaría en un
repositorio con Pages público. Conviene moverlos fuera y rotar lo que sea real.

## Convenciones

Los commits van en español. El `data.json` del tablero de MX Paid es un objeto
`{generado_utc, registros, data}`, no un arreglo plano — `index.html` espera esa
forma, así que envolverlo distinto lo rompe.
