# Arranque rápido

Tarjeta de referencia para abrir un chat nuevo sin perder contexto.
Última actualización: 23 de septiembre de 2026.

## Lo primero, en cada chat nuevo

**Abre la carpeta del proyecto** (`habi/tablero-mx-paid`). Con eso se carga solo
el `CLAUDE.md` y la memoria del proyecto.

**Si notas que no reconoce las tablas ni las consultas** —por ejemplo, si te
pregunta dónde están los datos en vez de ir a buscarlos— invoca:

```
/habi-data-mx
```

Esa skill trae el mapa de tablas, las llaves de cruce, el benchmark y las
trampas. Normalmente se activa sola al preguntar por leads, CPQL, inversión,
campañas o atribución; el `/` es sólo el respaldo.

## Tableros

| | |
|---|---|
| Portada | https://leonardoherrera-habi.github.io/ |
| ChatGPT Ads MX | https://leonardoherrera-habi.github.io/tablero-mx-paid/chatgpt-mx/ |
| MX Paid Media | https://leonardoherrera-habi.github.io/tablero-mx-paid/ |
| Ask Price | https://leonardoherrera-habi.github.io/tablero-mx-paid/ask_price_dashboard_v2.html |

La portada vive en **otro repositorio**: `habi/leonardoherrera-habi.github.io`.
Publicar un tablero nuevo son dos push, uno en cada carpeta.

## Hojas que alimentan el tablero de ChatGPT

| | |
|---|---|
| Gasto (API de OpenAI, cada 3 h) | [1n9XuIEhc...](https://docs.google.com/spreadsheets/d/1n9XuIEhc44nKhLKFC9maPE7qDLTDSP_tMFa0yXq_ICg/edit) |
| Leads (BigQuery, cada 3 h) | [1h0R45qld...](https://docs.google.com/spreadsheets/d/1h0R45qldunhQRDzZu9WI59Q1Mrr8UEHOafMb4MRk9qU/edit) |
| Diccionario UTM MX | [1sBg4hIBz...](https://docs.google.com/spreadsheets/d/1sBg4hIBzWDTfZhORtr-HtVIfxvnILmJqCqfzuk1Jpxk/edit) |

Las dos primeras las llenan Apps Scripts. Para agregar una prueba a la lista de
exclusión hay que editar `NID_PRUEBA` en el script **y volver a pegarlo en Apps
Script** — el repositorio no se sincroniza solo.

## Identificadores que siempre hacen falta

```
Campaña ChatGPT   Tuhabi_Chatgpt_Conversiones_MX_Nacional
Pixel OpenAI      JZgULRooMpYvxXHUTDpqvr
Contenedor GTM    GTM-5G6H9JW
Portal HubSpot    6215805
Proyecto BQ       papyrus-data-mx
```

En HubSpot se busca por **`nid`** (el negocio) y **`vid`** (el contacto), nunca
por `id_negocio`, que es el interno de Habi:

```
https://app.hubspot.com/contacts/6215805/record/0-3/{nid}
https://app.hubspot.com/contacts/6215805/record/0-1/{vid}
```

## Archivos de referencia en el repositorio

| archivo | para qué |
|---|---|
| `chatgpt-mx/bqq.sh` | correr consultas a BigQuery (el CLI de `bq` no conecta) |
| `chatgpt-mx/BENCHMARK-Y-MATRIZ.md` | CPL y CPQL por canal, y la matriz de evaluación |
| `chatgpt-mx/PATRON-TABLEROS-AUTOMATICOS.md` | cómo hacer que un tablero se actualice solo |
| `chatgpt-mx/ALTA-CHATGPT-EN-INVERSIONES.md` | ficha para Data Engineering |
| `chatgpt-mx/AppsScript_leads.gs` · `_gasto.gs` | los dos scripts que alimentan las hojas |
| `metodo-medir-corte-de-senal.md` | cómo medir el impacto de un incidente |

## Pendientes, por orden de plata

**Tablero de MX Paid congelado desde el 13 de junio.** Es el que impide ver
cualquier cosa nueva. Ya ha hecho parecer dos veces que una campaña "no cae"
cuando en BigQuery estaba perfecta.

**Google sin reportar inversión desde el 1 de septiembre.** Cero filas en
`resumen_inversiones_mkt_mx`, no filas en cero.

**SAC dejó de etiquetarse el 25 de agosto.** El tráfico sigue llegando pero sin
UTM, así que cae en el WEB general. Falta respuesta de ese equipo.

**Archivos con pinta de token en `.github/workflows/`** (`EAAJ...txt`, prefijo de
Meta). Sin trackear, pero un `git add .` los publicaría. Lo más barato de
arreglar y lo de mayor riesgo.

**Conector de ChatGPT Ads** hacia `resumen_inversiones_mkt_mx`. Mientras no
exista, el gasto vive en una hoja y no aparece en el tablero de MX Paid.

## Estado de ChatGPT Ads

Campaña entregando desde el 9 de septiembre. Al 23: 6 leads reales, 5
calificados, 1 cita agendada. CPQL acumulado US$80; **últimos 7 días US$37**, en
banda de altamente exitoso.

El píxel estuvo dos semanas sin registrar conversiones porque un arreglo en Tag
Manager se quedó 18 días sin publicar. Ya se publicó y las conversiones fluyen.

Recordatorio al leer resultados: los cierres van a ser cero durante meses. El
ciclo calificación → cierre es de 49 días de mediana y 130 en el p90.
