WITH base AS (SELECT *, COUNTIF(fuente IS NOT NULL) OVER (PARTITION BY date, plataforma, campana_original) n
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND date BETWEEN '2026-09-01' AND '2026-09-22')
SELECT plataforma, ROUND(SUM(spend),2) cruda, ROUND(SUM(IF(n>0 AND fuente IS NULL,0,spend)),2) corr, ROUND(SUM(conversion_mxn),2) mxn FROM base GROUP BY 1 ORDER BY 1
