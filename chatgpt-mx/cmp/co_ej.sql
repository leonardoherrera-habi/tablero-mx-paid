-- 1) Google: campaña-día con renglón original duplicado, el más grande de agosto
WITH b AS (SELECT *, COUNTIF(fuente IS NOT NULL) OVER (PARTITION BY date, plataforma, campana_original) n
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Colombia' AND plataforma='Google' AND date BETWEEN '2026-08-01' AND '2026-08-31')
SELECT 'dup' k, CAST(date AS STRING) d, campana_original c, ROUND(SUM(IF(fuente IS NOT NULL,spend,0)),2) a, ROUND(SUM(IF(fuente IS NULL,spend,0)),2) b, COUNTIF(fuente IS NOT NULL) x, MAX(clicks) y
FROM b WHERE n>0 GROUP BY 2,3 HAVING b>0 ORDER BY b DESC LIMIT 1
