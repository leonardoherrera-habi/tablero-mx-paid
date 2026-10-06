**Asunto: Revisión de `sellers_inversion_marketing_regiones_global_dwh` (México) antes de migrar la comparativa de inversión**

Hola equipo,

Queremos migrar la comparativa de inversión de medios de México a
`papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`. La comparamos mes a mes (ene – 22 sep 2026) contra las plataformas (cuentas "Sellers USD") y contra la tabla actual `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx`.

**Resultado:** la tabla actual cuadra con las plataformas. La nueva no cuadra en ninguna. Sumando `spend` directo, Meta queda −94%, Google +49% a +72%, Bing +44% a +77% y TikTok −2% a +25%. Encontramos 5 problemas. Adjunto el Excel con el detalle; cada punto trae un ejemplo real y la consulta para reproducirlo.

---

**1. El renglón original se queda duplicado después del prorrateo por área (Google y Bing)**

Las campañas nacionales se reparten en 9 áreas metropolitanas (renglones con `fuente` = WEB / Lead Forms / Estudio Inmueble). En muchas campañas-día, **además de esos 9 renglones repartidos, se conserva el renglón original sin repartir**. Se reconoce porque trae `fuente` NULL, `area_metropolitana` = 'sin area metropolitana' y `area_metropolitana_id` NULL. Así, el gasto se cuenta dos veces.

- Ejemplo: 10-ago-2026, `aw_tuhabi_mx_performance_max_nal_max_conv_price`. Los 9 renglones repartidos suman US$557.90 y el renglón original trae US$558.00. La tabla suma US$1,115.90; Google Ads reporta US$558.
- Impacto ene–sep: **US$274,780 de gasto duplicado en Google y US$8,220 en Bing.**
- Qué revisar: cuando una campaña-día se prorratea, el renglón original debe eliminarse o no insertarse. No pasa en todas las campañas; en Google afecta sobre todo a las de Max Val ROAS / `conv_price` y en Bing a las de brand y Max_Val_Roas. Conviene revisar por qué el reemplazo falla sólo en esas.
- Regla de control: por (`date`, `plataforma`, `campana_original`), `SUM(spend)` = gasto de la plataforma.

```sql
SELECT date, campana_original, area_metropolitana, area_metropolitana_id, fuente, spend, clicks, impressions
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Mexico' AND date = '2026-08-10'
  AND campana_original = 'aw_tuhabi_mx_performance_max_nal_max_conv_price'
ORDER BY area_metropolitana;
```

**2. Clics e impresiones se copian en cada área en lugar de prorratearse (Google, Bing y TikTok)**

El gasto sí se reparte entre las áreas, pero clics e impresiones se copian completos en cada renglón.

- Ejemplo: 10-ago-2026, `aw_tuhabi_mx_performance_max_nal_max_conv_2_1`. Los 9 renglones traen `clicks` = 414 e `impressions` = 14,375 cada uno. La tabla suma 3,726 clics; Google Ads reporta 414.
- En otras campañas (por ejemplo `conv_price`), los renglones repartidos traen clics e impresiones en NULL, y el valor sólo aparece en el renglón original duplicado del punto 1. Es decir, hay dos tratamientos distintos.
- Impacto en el total mensual: Google clics ×2.9–×6.0 e impresiones ×2.1–×7.3; Bing ×1.2–×3.7; TikTok ×4.9–×7.5. Cualquier CPC, CTR o CPM que se calcule con esta tabla sale mal.
- Qué revisar: prorratear clics e impresiones con el mismo factor que el gasto (o dejarlos en un solo renglón), y usar el mismo tratamiento en todas las campañas.

```sql
SELECT date, campana_original, area_metropolitana, fuente, spend, clicks, impressions
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Mexico' AND date = '2026-08-10'
  AND campana_original = 'aw_tuhabi_mx_performance_max_nal_max_conv_2_1';
```

**3. Meta: el gasto en USD se trata como si fuera MXN**

La cuenta *Habi Mexico Sellers (USD)* (act 205661715114408) reporta en dólares. La tabla toma ese valor como pesos y lo divide entre el tipo de cambio (~17).

- Ejemplo: 27-jul-2026, `FB_HabiWeb_LeadAds_ADVANTAGE_ConvLeadAds`: `valor_original` = 175.89, `moneda` = 'USD', `conversion_mxn` = 175.89 y `spend` = `conversion_usd` = 10.09.
- Agosto 2026: Meta Ads Manager reporta US$185,994.11 y la tabla actual US$186,002. La tabla nueva trae US$10,900.41, y su `conversion_mxn` (185,994.28) en realidad son dólares.
- Impacto: Meta es ~75% de la inversión de MX y queda 94% abajo en USD (y 17 veces abajo en MXN).
- Qué revisar: si la cuenta está en USD, `spend` = `conversion_usd` = `valor_original` y `conversion_mxn` = `valor_original` × tipo de cambio. Parece que la regla fuerza MXN para Facebook MX en lugar de leer la moneda de la cuenta. Las cuentas de Sellers MX y CO en Meta están en USD. Existe otra cuenta, *Habi Mexico Sellers (MXN)*, que no corresponde a Sellers.

```sql
SELECT FORMAT_DATE('%Y-%m', date) mes, SUM(valor_original) valor_original,
       SUM(spend) spend_usd, SUM(conversion_mxn) mxn, STRING_AGG(DISTINCT moneda) moneda
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Mexico' AND plataforma = 'Facebook' AND date >= '2026-01-01'
GROUP BY 1 ORDER BY 1;
```

**4. TikTok Lead Forms: cargos extra de US$6.96 en el área "otros"**

La campaña `tuh-mex-sel-pai-per-lfr-tka-tlg-tad-nal-smrt` trae más gasto que TikTok, **siempre en múltiplos de US$6.96**. Parte cae en `area_metropolitana` = 'otros', y aparece gasto incluso en días en que la plataforma marca US$0 (9, 15, 29 y 30 de agosto).

- Ejemplo: 20-ago-2026. TikTok y la tabla actual marcan US$95.00. La tabla nueva trae US$122.84: US$101.96 repartidos más US$20.88 en "otros" (3 × 6.96).
- Agosto: TikTok reporta US$1,786.32 en esta campaña; la tabla nueva, US$2,142.
- Qué revisar: de dónde sale el 6.96 y el área "otros". Parece un costo por lead que se suma encima del gasto real en vez de repartirlo.

```sql
SELECT date, area_metropolitana, fuente, spend, clicks
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Mexico' AND date = '2026-08-20'
  AND campana_original = 'tuh-mex-sel-pai-per-lfr-tka-tlg-tad-nal-smrt'
ORDER BY area_metropolitana;
```

**5. La columna `moneda` no refleja la moneda real**

`moneda` dice 'USD' en todos los renglones de MX, pero en Meta `conversion_mxn` = `valor_original`. Es decir, la tabla trata `valor_original` como MXN aunque la etiqueta diga USD. Proponemos que `moneda` sea la moneda real de la cuenta publicitaria y que las tres conversiones (usd, cop, mxn) partan de ella.

---

**Prueba de aceptación que proponemos:** para cada plataforma y mes, `SUM(spend)`, `SUM(clicks)` y `SUM(impressions)` de la tabla nueva deben ser iguales (±0.5%) a lo que reporta la plataforma (columna "Plataforma" del Excel, hojas Gasto, Clics e Impresiones). Además, `SUM(conversion_mxn)` debe ser igual a `SUM(spend)` × tipo de cambio.

Mientras tanto seguimos usando `resumen_inversiones_mkt_mx`. Después de México haremos la misma validación para Colombia.

¡Gracias!
