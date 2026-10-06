WITH base AS (
  SELECT *, COUNTIF(fuente IS NOT NULL) OVER (PARTITION BY date, plataforma, campana_original) n
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND date BETWEEN '2026-01-01' AND '2026-09-22' AND plataforma IN ('Google','Bing','TikTok')),
nueva AS (SELECT plataforma, campana_original c, FORMAT_DATE('%Y-%m',date) mes, SUM(IF(n>0 AND fuente IS NULL,0,spend)) s FROM base GROUP BY 1,2,3),
act AS (SELECT plataforma, campana_original c, FORMAT_DATE('%Y-%m',date) mes, SUM(spend) s
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` WHERE date BETWEEN '2026-01-01' AND '2026-09-22' AND plataforma IN ('Google','Bing','TikTok') GROUP BY 1,2,3),
j AS (SELECT COALESCE(a.plataforma,n.plataforma) p, COALESCE(a.c,n.c) c, COALESCE(a.mes,n.mes) mes, IFNULL(a.s,0) act, IFNULL(n.s,0) nueva
  FROM act a FULL JOIN nueva n ON a.plataforma=n.plataforma AND a.c=n.c AND a.mes=n.mes)
SELECT p, c, ROUND(SUM(act),0) act_total, ROUND(SUM(nueva),0) nueva_corr_total, ROUND(SUM(nueva-act),0) dif,
  STRING_AGG(IF(ABS(nueva-act)>=20, CONCAT(SUBSTR(mes,6),':',CAST(ROUND(nueva-act) AS STRING)), NULL), ' ' ORDER BY mes) meses
FROM j GROUP BY 1,2 HAVING ABS(SUM(nueva-act))>=50 ORDER BY ABS(SUM(nueva-act)) DESC
