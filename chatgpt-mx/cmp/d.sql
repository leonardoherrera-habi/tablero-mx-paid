WITH n AS (
  SELECT plataforma, campana_original c, producto, SUM(spend) usd_n, SUM(clicks) clk_n, COUNT(*) filas, COUNT(DISTINCT region) regs
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY 1,2,3),
v AS (
  SELECT plataforma, campana_original c, SUM(spend) usd_v, SUM(clicks) clk_v, COUNT(*) filas_v
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` WHERE date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY 1,2)
SELECT COALESCE(n.plataforma,v.plataforma) plat, COALESCE(n.c,v.c) campana, producto, ROUND(usd_v,0) usd_v, ROUND(usd_n,0) usd_n, clk_v, clk_n, filas_v, filas, regs
FROM n FULL JOIN v ON n.plataforma=v.plataforma AND n.c=v.c
WHERE COALESCE(n.plataforma,v.plataforma) IN ('Google','Bing','TikTok')
ORDER BY 1, GREATEST(IFNULL(usd_v,0),IFNULL(usd_n,0)) DESC
