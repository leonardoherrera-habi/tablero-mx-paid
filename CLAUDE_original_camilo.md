# Tablero MX Paid Media — Contexto del Proyecto

## Descripción

Dashboard de **Paid Media para México** de Habi, publicado en GitHub Pages. URL de producción: [https://leonardoherrera-habi.github.io/tablero-mx-paid/](https://leonardoherrera-habi.github.io/tablero-mx-paid/) Repositorio local: `C:\Users\leonardoherrera_tuha\habi\tablero-mx-paid` Hub de tableros: [https://leonardoherrera-habi.github.io/](https://leonardoherrera-habi.github.io/)

## Propósito

Visualizar el **funnel de marketing \+ inversión paid** de México, cruzando:

- Leads (cohorte por fecha de creación del lead)  
- Spend de paid media (Google, Facebook, Bing)

## Fuente de datos

- Datos de leads vía UTM dict: `registro_unico_utm_mkt_mexico`  
- El día actual siempre se **excluye** del cómputo

## Lógica de Atribución

Alineada con el tablero de **Camilo Otoya** usando la llave `mkt_channel_big`.

Tanto leads como spend se **reasignan** a los siguientes canales según el canal nativo de cada campaña en el UTM dict:

| Canal big | Descripción |
| :---- | :---- |
| `Web` | Tráfico web general |
| `EI` | Estudio Inmobiliario |
| `LF` | LF (Listing Flow o similar) |
| `Otros` | Brand y Propiedades |

**Regla de fallback:** Si `campana_mercadeo` del lead es nula o no matchea, se mantiene el `fuente_id` original del lead.

## Filtros disponibles

| Filtro | Opciones |
| :---- | :---- |
| Periodo | 7 días / 30 días / 90 días / YTD / Todo |
| Granularidad | Día / Semana / Mes / Trimestre / Año |
| Fuente | Todas / WEB / LF / Estudio Inm. / Otros |
| Plataforma | Todas / Google / Facebook / Bing |
| Campaña | Todas / (dinámica por plataforma) |

## Secciones del tablero

### 1\. Volumen por periodo (conteos crudos del funnel)

Columnas: `Periodo | Impressions | Clicks | Creados | Calificados | Asignados | Cita Agend. | Cierres | Asg/Cierre | % CTR | % Click→Lead | % Conv. Rate | % Tasa Asg. | % Cita Agend. | % Cierre`

### 2\. Costos por periodo (inversión y costo por etapa)

Columnas: `Periodo | Inversión | CPM | CPC (clk) | CP Lead | CP Calificado | CP Asignado | CP Cita | CP Cierre`

### 3\. Desglose por Fuente × Sub-fuente

Sub-fuentes: `Web Paid / Web Direct / Web Community / Web Referral` y equivalentes para EI y LF (campo: `mkt_channel_medium`) Columnas: `Fuente | Sub-fuente | Inversión | Creados | Calificados | Asignados | Cierres | CP Lead | CP Calif. | CP Cierre | % Calif. | % Cierre`

### 4\. Desglose granular: Fuente × Sub-fuente × Plataforma × Campaña

Spend \+ leads matched. Headers clickeables para ordenar. Columnas: `Fuente | Sub-fuente | Plataforma | Campaña | Inversión | Impr. | Clicks | Creados | Calificados | Asignados | Cierres | % CTR | CPC | CP Lead | CP Calif. | CP Cierre`

## Stack técnico

- HTML / CSS / JavaScript (estático, sin framework)  
- Publicado en GitHub Pages  
- Modo oscuro (🌙) disponible

## Notas importantes

- Los headers de la tabla granular son **clickeables para ordenar**  
- El tablero es parte de un hub mayor en `https://leonardoherrera-habi.github.io/` que incluye otros tableros de Marketing Sellers  
- El nombre del propietario/desarrollador: **Leonardo Herrera** (Habi México)

## Comandos útiles

```shell
# Ir al proyecto
cd C:\Users\leonardoherrera_tuha\habi\tablero-mx-paid

# Ver estado del repo
git status

# Publicar cambios a GitHub Pages
git add .
git commit -m "descripción del cambio"
git push origin main
```

