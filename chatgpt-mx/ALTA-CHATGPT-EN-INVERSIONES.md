# Alta de ChatGPT Ads en las tablas de inversión — México

Ficha para Data Engineering. Todo verificado contra producción el 21-sep-2026.

## Las dos tablas involucradas

### 1. Tabla de gasto — donde hay que escribir

`papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx`

| columna | tipo | qué poner para ChatGPT |
|---|---|---|
| `date` | DATE | día del gasto |
| `spend` | FLOAT | **en DÓLARES** (ver nota de moneda) |
| `clicks` | FLOAT | clics del día |
| `impressions` | FLOAT | impresiones del día |
| `plataforma` | STRING | `Chatgpt` |
| `campana` | STRING | `Tuhabi_Chatgpt_Conversiones_MX_Nacional` |
| `campana_original` | STRING | `Tuhabi_Chatgpt_Conversiones_MX_Nacional` |
| `categoria` | STRING | `Performance` |
| `formato` | STRING | `Otro` |
| `formato_v2` | STRING | `Otro` |
| `producto` | STRING | `Sellers` |
| `medio` | STRING | `Paid` |
| `canal_adquisicion` | STRING | `Web` |
| `objetivo_campana` | STRING | `Chatgpt_conversions` |

Los valores siguen el patrón de TikTok y Bing, que son las dos plataformas
integradas más recientemente.

### 2. Diccionario UTM — ya está listo, no hay que tocarlo

`sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`

Es una EXTERNAL TABLE sobre una hoja de Google, no una tabla nativa. La campaña
**ya está dada de alta** ahí:

```
campana_mercadeo_original : Tuhabi_Chatgpt_Conversiones_MX_Nacional
mkt_campaign_name         : Tuhabi_Chatgpt_Conversiones_MX_Nacional
mkt_channel_big           : WEB
mkt_channel_medium        : WEB Paid
mkt_media                 : Paid
mkt_platform              : Chatgpt
```

## Tres cosas que rompen esto si se pasan por alto

**1. La moneda.** La tabla de inversiones está en **dólares** — se comprueba con
cualquier fila: Facebook reporta 7,230 de gasto contra 19,834 clics, o sea 0.36
por clic; en pesos serían 2 centavos de dólar por clic, imposible en México.

La API de OpenAI reporta el gasto **en pesos**, porque ésa es la moneda de la
cuenta publicitaria. Hay que convertir antes de insertar, y documentar de dónde
sale el tipo de cambio. Si esto se omite, el gasto entra inflado 17 veces y
**nada falla** — los CPL simplemente quedan mal y se ven plausibles.

**2. `campana_original` tiene que ser idéntico a `mkt_campaign_name`.** La query
del tablero cruza así:

```sql
LEFT JOIN cmp_to_class c ON c.cmp = i.campana_original
```

Un carácter distinto y el gasto entra pero queda sin clasificar, cayendo en
"Otros" en vez de WEB Paid.

**3. El filtro de plataformas del tablero.** En `query.sql`:

```sql
AND i.plataforma IN ('Google', 'Facebook', 'Bing')
```

Hay que agregar `'Chatgpt'`. Sin eso el dato llega a la tabla y la query lo
descarta.

## La fuente: API de anuncios de OpenAI

Existe y funciona. Ya la estamos consumiendo desde un Apps Script
(`chatgpt-mx/AppsScript_gasto.gs` en este repo), así que el contrato está
verificado con llamadas reales:

```
GET https://api.ads.openai.com/v1/ad_account/insights
    Authorization: Bearer <key>
    aggregation_level=campaign
    time_granularity=daily
    time_ranges[]={"type":"date_range","since":"YYYY-MM-DD","until":"YYYY-MM-DD","timezone":"America/Mexico_City"}
    fields[]=campaign.id&fields[]=campaign.name&fields[]=metadata.readable_time
    &fields[]=campaign.impressions&fields[]=campaign.clicks&fields[]=campaign.spend
```

Detalles que cuestan una tarde si no se saben:

- **El request pide los campos con punto** (`campaign.spend`) **pero la respuesta
  los devuelve cortos y planos** (`spend`). Mandar los nombres cortos en el
  request da un 400 que lista los canónicos.
- `campaign.start_time` es el inicio de la **campaña**, no el día del dato. El día
  viene en `metadata.readable_time`, como `YYYY-MM-DD`.
- La API **corrige días hacia atrás**. El 14 de septiembre pasó de 8.93 a 454.70
  entre una lectura y la siguiente, un factor de cincuenta. Cualquier carga tiene
  que reprocesar una ventana móvil, no sólo el día nuevo.
- La key se genera en Ads Manager → Configuración → General → API Keys, está
  amarrada a una sola cuenta publicitaria y se muestra una única vez.
- Las conversiones **no** salen de este endpoint; viven en
  `POST /conversions/insights`.

## Backfill

Desde el **9 de septiembre de 2026**, que es cuando la campaña empezó a entregar.
El `start_time` del 7 que aparece en el export es la fecha de creación, no la de
entrega.

## Mientras tanto

El tablero de ChatGPT corre con una hoja de Google que el Apps Script llena cada
tres horas desde esa misma API:
https://leonardoherrera-habi.github.io/tablero-mx-paid/chatgpt-mx/

Es un puente, no el destino. Cuando el conector escriba en
`resumen_inversiones_mkt_mx`, el canal aparece solo en el tablero de MX Paid y
esta hoja se puede retirar.
