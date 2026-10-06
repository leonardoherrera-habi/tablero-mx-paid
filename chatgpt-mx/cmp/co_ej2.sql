SELECT 'google' k, CAST(date AS STRING) d, area_metropolitana a, IFNULL(fuente,'NULL') f, ROUND(spend,2) s, clicks c, impressions i, CAST(NULL AS FLOAT64) o, moneda m
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Colombia' AND date='2026-08-24' AND campana_original='hab-col-hmt-pai-per-web-gga-gwg-gsr-nal'
UNION ALL
(SELECT 'meta', CAST(date AS STRING), campana_original, CAST(ROUND(conversion_cop,2) AS STRING), ROUND(spend,4), clicks, impressions, valor_original, moneda
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Colombia' AND plataforma='Facebook' AND date='2026-08-24' ORDER BY valor_original DESC LIMIT 1)
UNION ALL
SELECT 'nulos', MIN(d), CONCAT(plataforma,' ',mes), CAST(COUNT(*) AS STRING), 0, SUM(clicks), COUNTIF(valor_original IS NULL), SUM(valor_original), STRING_AGG(DISTINCT IFNULL(fuente,'NULL'))
FROM (SELECT *, CAST(date AS STRING) d, FORMAT_DATE('%Y-%m',date) mes FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Colombia' AND plataforma IN ('Bing','TikTok') AND date BETWEEN '2026-01-01' AND '2026-06-30' AND spend IS NULL)
GROUP BY plataforma, mes
ORDER BY 1,2,3
