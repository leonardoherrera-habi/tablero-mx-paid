SELECT plataforma, COUNT(*) filas, COUNTIF(region='desconocida' OR region IS NULL) sin_region, COUNT(DISTINCT region) regiones, COUNT(DISTINCT area_metropolitana) areas, STRING_AGG(DISTINCT IFNULL(fuente,'NULL')) fuentes
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Mexico' AND date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY 1
