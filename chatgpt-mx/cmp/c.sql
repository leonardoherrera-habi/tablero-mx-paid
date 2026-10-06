WITH n AS (
  SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, SUM(spend) usd_n, SUM(conversion_usd) cusd_n, SUM(conversion_mxn) mxn_n, SUM(valor_original) orig_n,
         SUM(clicks) clk_n, SUM(impressions) imp_n, STRING_AGG(DISTINCT moneda) monedas
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND date>='2026-01-01' GROUP BY 1,2),
v AS (
  SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, SUM(spend) usd_v, SUM(clicks) clk_v, SUM(impressions) imp_v
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` WHERE date>='2026-01-01' GROUP BY 1,2)
SELECT COALESCE(n.mes,v.mes) mes, COALESCE(n.plataforma,v.plataforma) plat,
  ROUND(usd_v,0) usd_actual, ROUND(usd_n,0) usd_nueva, ROUND(SAFE_DIVIDE(usd_n,usd_v)-1,4) dif_pct,
  ROUND(mxn_n,0) mxn_nueva, ROUND(SAFE_DIVIDE(mxn_n,usd_n),2) tc, ROUND(orig_n,0) orig, monedas,
  clk_v, clk_n, imp_v, imp_n
FROM n FULL JOIN v ON n.mes=v.mes AND n.plataforma=v.plataforma ORDER BY 1,2
