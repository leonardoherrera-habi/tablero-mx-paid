---
name: habi-data-mx
description: Consultar y analizar los datos de marketing y funnel de sellers de Habi México en BigQuery. Úsala siempre que la pregunta toque leads, registros, calificados, asignados, citas, cierres, CPL, CPQL, inversión, campañas, UTMs, atribución o desempeño de canales (Google, Meta, TikTok, Bing, ChatGPT Ads, Habímetro, Lead Forms, SAC) en México — aunque el usuario no nombre BigQuery ni una tabla. También aplica para comentarios de WBR, comparar un canal contra el benchmark, revisar por qué cayeron los leads, auditar si una campaña está cayendo bien en las tablas internas, o rastrear un negocio en HubSpot desde el warehouse. Trae el mapa de tablas, las llaves de cruce y las trampas que ya costaron horas descubrir.
---

# Datos de marketing de Habi México

Esta skill existe porque el modelo de datos de Habi MX tiene varias trampas que
no se ven hasta que producen un número equivocado y creíble. Cada apartado de
"trampas" corresponde a un error que ya ocurrió.

## Cómo consultar

**El CLI de `bq` no conecta en la máquina de Leonardo.** Su Python empaquetado
falla con `TimeoutError(10060)` al abrir el socket, aunque `curl` llega sin
problema. No pierdas tiempo diagnosticándolo: ve por la API REST.

Hay un helper listo en `habi/tablero-mx-paid/chatgpt-mx/bqq.sh`:

```bash
export PATH="/usr/bin:/bin:/mingw64/bin:$PATH"
cd /c/Users/leonardoherrera_tuha/habi/tablero-mx-paid/chatgpt-mx
./bqq.sh mi_consulta.sql
```

Internamente hace `gcloud auth print-access-token` y un POST a
`https://bigquery.googleapis.com/bigquery/v2/projects/papyrus-data-mx/queries`.

Tres cosas que rompen esto si se olvidan:

- Hay que exportar `CLOUDSDK_PYTHON` apuntando al Python empaquetado del SDK, o
  `gcloud` ni arranca.
- El sandbox del Bash tool bloquea la red saliente. Estas llamadas necesitan
  `dangerouslyDisableSandbox: true`.
- Node es nativo de Windows: **no uses rutas `/tmp`** al pasar archivos entre
  bash y node, porque node las resuelve como `C:\tmp`. Usa rutas relativas.

Después de un cambio de directorio, el `PATH` del shell puede quedar roto
(`mkdir: command not found`). Reexpórtalo como arriba.

## Mapa de tablas

| qué | tabla |
|---|---|
| Leads y funnel completo | `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` |
| Inversión, clics, impresiones | `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` |
| Asignados (fuente oficial del WBR) | `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart` |
| Cierres | `sellers-main-prod.bi_mx.seguimiento_funnel_mex` (`valor = 'Cierre - Comprado'`) |
| Diccionario UTM | `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico` |

**La cuenta es de solo lectura.** No hay permiso de `bigquery.tables.create` en
ningún dataset alcanzable. Si el plan requiere crear una tabla, hay que pedirlo
a Data Engineering o usar una hoja de Google como puente.

## Llaves de cruce

Éstas no son obvias y equivocarlas produce resultados silenciosamente mal:

- **Leads ↔ asignados / cierres:** por `nid`
- **Leads ↔ `habi_db_history_state`:** por `deal_id` = `id_negocio`
- **Gasto ↔ diccionario:** `resumen_inversiones.campana_original` = `dict.mkt_campaign_name`
- **Leads ↔ diccionario:** `tabla_inmuebles_general.campana_mercadeo` = `dict.campana_mercadeo_original`

Las dos últimas son columnas **distintas** del diccionario. Cruzar leads y gasto
por la misma columna es un error frecuente.

## Las trampas

### El diccionario UTM es una hoja de Google

`registro_unico_utm_mkt_mexico` es una EXTERNAL TABLE sobre
`docs.google.com/spreadsheets/d/1sBg4hIBzWDTfZhORtr-HtVIfxvnILmJqCqfzuk1Jpxk`,
pestaña `MX`. Consecuencias:

- **No admite INSERT.** Dar de alta una campaña es agregar un renglón a la hoja.
- **Leer sus filas desde la API de BigQuery falla** con
  `Permission denied while getting Drive credentials`. El `INFORMATION_SCHEMA` sí
  responde porque es metadata. Para leer el contenido, usa el conector de Google
  Drive con ese fileId.
- La organización **bloquea el scope de Drive para cuentas de servicio**, así que
  cualquier pipeline automatizado que haga JOIN a esta tabla va a fallar. Si la
  consulta es sobre una sola campaña, resuélvela con un `CASE` y evita el JOIN.

### No clasifiques campañas por prefijo del nombre

Sólo **55 de 192** campañas de Meta empiezan con `FB_`. Clasificar por prefijo
subcuenta los registros y produce tasas de conversión infladas. Usa siempre el
diccionario real.

Para el tipo de campaña de Google, los tokens del nombre sí funcionan y cubren el
100% del gasto — es la misma lógica de `query_sheet_ask_price.sql`:

```
gdg → Demand Gen   ·   gpm / performance_max → P Max   ·   gsr / sem / -gga- → Search
```

### Excluye las campañas de marca de Search

Con marca, el CPQL de Google Search baja de **$18 a $4** y cualquier comparación
contra un canal de prospección se rompe. El filtro: `campana_original LIKE '%brand%'`.

### `nid` es el ID de HubSpot, `id_negocio` es el interno

Buscar por `id_negocio` en HubSpot no devuelve nada. Las URLs se arman así:

```
Negocio:  https://app.hubspot.com/contacts/6215805/record/0-3/{nid}
Contacto: https://app.hubspot.com/contacts/6215805/record/0-1/{vid}
```

### La columna del nombre está mal bautizada

`nombre_inmobiliaria` **no** guarda el nombre de una inmobiliaria: guarda el
**nombre de la persona**. No hay otra columna con el nombre.

Y `correo` y `telefono` llegan **hasheados en algunos leads y en texto plano en
otros**. Dos leads con el mismo hash son la misma persona — sirve para detectar
pruebas duplicadas — pero no se puede filtrar por dominio de correo de forma
confiable.

### Moneda

`resumen_inversiones_mkt_mx` está en **dólares**. Se comprueba con cualquier fila:
Facebook reporta ~$0,36 por clic; en pesos serían 2 centavos de dólar, imposible.

Las plataformas que reportan en pesos (ChatGPT Ads, por ejemplo) hay que
convertirlas antes de comparar. Si no, el gasto entra 17 veces inflado y **nada
falla** — los CPL simplemente salen creíbles y mal.

### Las hojas de Google exportan con coma decimal

Con configuración regional de México, el CSV trae `1293,71`. Quitar la coma como
si fuera separador de miles multiplica por cien. Regla segura: **gana el último
separador**.

### Fuera de zona es normal

**El 32% de los leads pagados** caen fuera de las zonas donde Habi compra, en
todos los canales por igual. No es un problema de segmentación de un canal
concreto; es estructural. Un canal con 25-35% está en lo normal.

### Rezagos del funnel

- **Registro → calificación: 0 días de mediana, 1 en el p90.** No hacen falta
  ventanas con semanas de colchón para medir calificados.
- **Calificación → cierre: 49 días de mediana, 130 en el p90.** Los cierres de un
  canal nuevo van a ser cero durante meses y eso no significa nada.

### Dos fuentes de asignados

`tabla_inmuebles_general.fecha_primer_asignacion` y el WBR mart dan números
distintos. **El tablero de marketing usa el WBR mart**, así que ése es el que
cuadra en el WBR. El mart tiene rezago de unos días.

### `utm_source` no es confiable para identificar plataforma

Las campañas de habímetro traen miles de leads y ninguno con `utm_source =
'google'`. Identifica la plataforma por el diccionario o por el nombre de campaña.

Ojo con `chatgpt` contra `chatgpt.com`: el primero es la campaña paga; el segundo
es tráfico orgánico de referencia, que existe desde enero de 2025 a razón de 4-5
leads mensuales y llega **sin campaña**.

## Benchmark WEB Paid México

Baseline enero–agosto 2026, del documento oficial de estrategia performance:

| canal | CPL USD | CPQL USD | Lead → Calif |
|---|---|---|---|
| Google Search | 12,60 | 19,53 | 64,5% |
| Google P Max | 18,41 | 30,89 | 59,6% |
| **Promedio del mix** | **31,99** | **50,74** | 63,0% |
| Google Demand Gen | 36,74 | 58,67 | 62,6% |
| Meta | 46,37 | 70,96 | 65,3% |
| TikTok | 69,29 | 114,12 | 60,7% |

Matriz para evaluar un canal nuevo, anclada a canales reales del mix:
**altamente exitoso < US$51 · esperado US$51–71 · no exitoso > US$71.**

No emitas veredicto con menos de 5 calificados: con uno o dos, el CPQL se mueve
por un factor de tres según caiga el siguiente lead.

## Convenciones de reporte

Las semanas del WBR van de **lunes a domingo**. Valida siempre las cifras de
inversión contra el sheet del equipo antes de escribir comentarios — si no
cuadran al peso, algo está mal en la clasificación.

Para medir el impacto de un incidente, el baseline correcto es **la semana
inmediatamente anterior, comparando cada día contra su gemelo**. El método
completo está en `metodo-medir-corte-de-senal.md`.

## Tableros

| tablero | estado |
|---|---|
| [ChatGPT Ads MX](https://leonardoherrera-habi.github.io/tablero-mx-paid/chatgpt-mx/) | vivo, se actualiza solo cada 3 h |
| [MX Paid Media](https://leonardoherrera-habi.github.io/tablero-mx-paid/) | **congelado desde el 13-jun-2026** |
| [Ask Price](https://leonardoherrera-habi.github.io/tablero-mx-paid/ask_price_dashboard_v2.html) | vivo, lee una hoja cada 5 min |
| [Portada](https://leonardoherrera-habi.github.io/) | repositorio aparte |

Si un tablero muestra datos viejos, revisa primero si su pipeline sigue corriendo
antes de dudar de los datos. El de MX Paid lleva meses congelado y eso ha hecho
parecer que campañas nuevas "no caen" cuando en BigQuery estaban perfectas.

## Cómo hacer que un tablero se actualice solo

Dos patrones probados en el repositorio, documentados en
`chatgpt-mx/PATRON-TABLEROS-AUTOMATICOS.md`:

**Apps Script + hoja de Google.** Un script con disparador horario consulta
BigQuery y escribe una hoja; el HTML la lee por CSV cada 5 minutos. Corre en
servidores de Google, no depende de ninguna laptop. Es el patrón del tablero de
ChatGPT y el que conviene por defecto.

**Playwright local.** `automation/refresh.js` captura el token de BQ Studio con
un navegador. Existe sólo para sortear el bloqueo de Drive; si la consulta no
toca el diccionario UTM, no hace falta.

Detalle que cuesta una tarde: una hoja convertida desde CSV **no tiene `gid` 0**.
Pedirle `gid=0` devuelve HTTP 400, que se confunde con "no es pública". Omite el
`gid` y usa la primera pestaña.

Y el CSV de Sheets **no manda `Access-Control-Allow-Origin` en el redirect a
orígenes nulos**, así que un HTML abierto con `file://` falla siempre. Tiene que
servirse desde un origen real, como GitHub Pages.
