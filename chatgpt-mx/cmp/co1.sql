SELECT 'nueva' t, pais, plataforma, COUNT(*) filas, MIN(date) d0, MAX(date) d1, ROUND(SUM(spend),0) spend
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE date >= '2026-01-01' AND pais != 'Mexico' GROUP BY 1,2,3
UNION ALL
SELECT 'actual', 'CO', plataforma, COUNT(*), MIN(date), MAX(date), ROUND(SUM(spend),0)
FROM `papyrus-data.habi_wh_bi.resumen_inversiones_mkt_co` WHERE date >= '2026-01-01' GROUP BY 1,2,3
ORDER BY 1,2,3
