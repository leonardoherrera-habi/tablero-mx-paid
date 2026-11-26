# Tablero: prueba Meta DP vs SEG

Compara las dos campañas de la prueba de señal en Meta, México web, con **datos
internos** (gasto del warehouse y funnel de nuestras tablas), no con los de Meta.

| Grupo | Campaña | Optimiza a |
|---|---|---|
| DP (Amplitude) | `FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612` | Lead Calificado DataPlatform |
| SEG (Segment) | `FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612` | Purchase (calificados MM + inmo) |

Inicio: 2-dic-2026. La primera semana es de aprendizaje y el tablero la excluye por defecto.

## Archivos

| archivo | qué es |
|---|---|
| `query_prueba_dp_seg.sql` | la query, una fila por día y campaña. **Fuente de verdad** |
| `AppsScript_prueba.gs` | corre la query cada 3 h y llena la hoja. Lleva el SQL embebido |
| `index.html` | el tablero; lee la hoja como CSV cada 5 min |
| `ejemplo.csv` | datos de ejemplo (Nacional como DP y GDL como SEG, 27-oct a 25-nov) |

Mientras `SHEET_ID` esté vacío en `index.html`, el tablero muestra `ejemplo.csv` con un
aviso. `?demo=1` fuerza el ejemplo aunque haya hoja.

## Instalación

Los pasos están en el encabezado de `AppsScript_prueba.gs`. En resumen: hoja nueva →
pegar el script → activar BigQuery API → correr `actualizar` → correr
`instalarDisparador` → compartir la hoja como lector con el enlace → pegar su id en
`SHEET_ID`.

## Si cambias la query

Edita `query_prueba_dp_seg.sql` y vuelve a generar el SQL embebido del `.gs` (quita
el `DECLARE`, sustituye `INICIO` por la fecha y lo mete como cadena en `var SQL`).

## Trampas que ya costaron tiempo

- **No filtrar las campañas con un JOIN contra `UNNEST`.** `tabla_inmuebles_general`
  es pesada: un JOIN contra la CTE `campanas` impide que BigQuery filtre antes y la
  query revienta por CPU ("exceeded resource limits"). Con `IN ('…','…')` tarda 3 s.
- **Repetidos** usa los 180 días anteriores. Sin ventana sale ~34 %, porque cuenta
  leads de hace años; con 180 días, ~16-18 %.
- **MM vs inmobiliaria** sale de `oportunidad_del_negocio = 'Captado para inmobiliaria'`.
- Antes del arranque la query devuelve una fila en ceros por campaña (no cero filas),
  para que Apps Script no marque error.
