SELECT FORMAT_DATE('%Y-%m',date) mes, COUNT(*) filas, COUNTIF(conversion_mxn IS NULL) mxn_null, COUNTIF(conversion_cop IS NULL) cop_null,
  ROUND(SUM(IF(conversion_mxn IS NULL, spend, 0)),0) usd_sin_mxn, MIN(IF(conversion_mxn IS NULL,date,NULL)) desde, MAX(IF(conversion_mxn IS NULL,date,NULL)) hasta
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Mexico' AND date BETWEEN '2026-01-01' AND '2026-09-22'
GROUP BY 1 ORDER BY 1
