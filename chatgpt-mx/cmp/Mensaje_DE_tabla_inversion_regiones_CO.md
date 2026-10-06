**Asunto: Revisión de `sellers_inversion_marketing_regiones_global_dwh` (Colombia) — complemento a la revisión de México**

Hola equipo,

Repetimos para Colombia la validación que hicimos en México: gasto mensual del 1-ene al 22-sep-2026, comparando la tabla nueva `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh` (`pais = 'Colombia'`) contra las plataformas y contra la tabla actual `papyrus-data.habi_wh_bi.resumen_inversiones_mkt_co`.

**Resultado:** la tabla actual cuadra con las plataformas. La nueva tiene los mismos dos problemas principales que México, más meses vacíos. Adjunto el Excel con el detalle; cada punto trae un ejemplo y la consulta para reproducirlo.

---

**1. Meta: el gasto en USD se trata como pesos colombianos**

La cuenta de Meta de Sellers Colombia está en USD. La tabla toma ese valor como COP y lo divide entre el tipo de cambio.

- Ejemplo: 24-ago-2026, `hab-col-sel-pai-per-web-mta-mld-oto-med-new`: `valor_original` = 388.72, `conversion_cop` = 388.72, `moneda` = 'USD' y `spend` = 0.13.
- Agosto 2026: la plataforma reporta US$67,713 y la tabla actual US$67,712. La tabla nueva trae **US$21.66**.
- Impacto: Meta suma **US$134 en todo 2026** contra US$471,534 reales. Es ~46% de la inversión de Colombia.
- Qué revisar: es el mismo error que en México, donde divide entre ~17 MXN. Si la cuenta está en USD, `spend` = `conversion_usd` = `valor_original` y `conversion_cop` = `valor_original` × tipo de cambio.

```sql
SELECT FORMAT_DATE('%Y-%m', date) mes, SUM(valor_original) valor_original,
       SUM(spend) spend_usd, SUM(conversion_cop) cop, STRING_AGG(DISTINCT moneda) moneda
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Colombia' AND plataforma = 'Facebook' AND date >= '2026-01-01'
GROUP BY 1 ORDER BY 1;
```

**2. Google: el renglón original se queda duplicado después del prorrateo**

Igual que en México: las campañas se reparten por área metropolitana (`fuente` = Habimetro / WEB), pero **también se conserva el renglón original sin repartir** (`fuente` NULL, `area_metropolitana` = 'Sin area metropolitana'). Así, el gasto se cuenta dos veces.

- Ejemplo: 24-ago-2026, `hab-col-hmt-pai-per-web-gga-gwg-gsr-nal`. Los 7 renglones repartidos suman US$778 y el renglón original trae US$777. La tabla suma US$1,555; el gasto real es US$777.
- Impacto: Google sale entre +26% y +38% cada mes, con **US$140,326 de gasto duplicado** entre el 1-ene y el 22-sep.
- Regla de control: por (`date`, `plataforma`, `campana_original`), `SUM(spend)` = gasto de la plataforma. Si quitamos el renglón original, Google cuadra con la tabla actual (±0.2%).

```sql
SELECT date, campana_original, area_metropolitana, fuente, spend
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Colombia' AND date = '2026-08-24'
  AND campana_original = 'hab-col-hmt-pai-per-web-gga-gwg-gsr-nal'
ORDER BY area_metropolitana;
```

**3. Meses completos con gasto vacío (NULL)**

- **Bing, junio 2026:** 22 renglones sin gasto. La plataforma y la tabla actual traen US$622.
- **TikTok, febrero 2026:** 27 renglones sin gasto. La plataforma y la tabla actual traen US$148.
- TikTok enero, marzo, abril y mayo también vienen en NULL, aunque ahí no hubo gasto. Debería ser 0, no NULL.

```sql
SELECT plataforma, FORMAT_DATE('%Y-%m', date) mes, COUNT(*) renglones, COUNTIF(spend IS NULL) spend_null
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais = 'Colombia' AND plataforma IN ('Bing', 'TikTok')
  AND date BETWEEN '2026-01-01' AND '2026-06-30'
GROUP BY 1, 2 ORDER BY 1, 2;
```

**4. La columna `moneda` no refleja la moneda real**

`moneda` dice 'USD' en todos los renglones de Colombia, pero en Meta `conversion_cop` = `valor_original`. Es decir, la tabla trata `valor_original` como COP aunque la etiqueta diga USD.

---

**Buenas noticias:** Bing y TikTok, en los meses que sí traen datos, cuadran con la plataforma (±0.7%). No encontramos en Colombia los cargos extra de TikTok que vimos en México.

**Prueba de aceptación que proponemos:** para cada plataforma y mes, `SUM(spend)` de la tabla nueva debe ser igual (±0.5%) al gasto de la plataforma (columna "Plataforma" de la hoja Gasto del Excel).

Mientras tanto seguimos usando `resumen_inversiones_mkt_co`.

¡Gracias!
