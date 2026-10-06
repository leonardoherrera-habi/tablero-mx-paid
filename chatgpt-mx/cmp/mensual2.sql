WITH base AS (
  SELECT *, COUNTIF(fuente IS NOT NULL) OVER (PARTITION BY date, plataforma, campana_original) n_prorr
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND date >= '2026-01-01' AND date <= IF(plataforma IN ('Google','Bing'),DATE '2026-09-23',DATE '2026-09-22')),
cruda AS (SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, SUM(spend) s, SUM(clicks) c, SUM(impressions) i, SUM(conversion_mxn) mxn, COUNT(*) filas FROM base GROUP BY 1,2),
cd AS (
  SELECT date, plataforma, campana_original,
    SUM(IF(n_prorr>0 AND fuente IS NULL, 0, spend)) s,
    IF(plataforma='Facebook', SUM(clicks), MAX(clicks)) c,
    IF(plataforma='Facebook', SUM(impressions), MAX(impressions)) i,
    SUM(IF(n_prorr>0 AND fuente IS NULL, spend, 0)) s_dup
  FROM base GROUP BY 1,2,3),
corr AS (SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, SUM(s) s, SUM(c) c, SUM(i) i, SUM(s_dup) s_dup FROM cd GROUP BY 1,2),
act AS (SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, SUM(spend) s, SUM(clicks) c, SUM(impressions) i
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` WHERE date >= '2026-01-01' AND date <= IF(plataforma IN ('Google','Bing'),DATE '2026-09-23',DATE '2026-09-22') GROUP BY 1,2)
SELECT mes, plataforma,
  ROUND(a.s,2) act_spend, a.c act_clk, a.i act_imp,
  ROUND(r.s,2) cruda_spend, r.c cruda_clk, r.i cruda_imp, ROUND(r.mxn,2) cruda_mxn, r.filas,
  ROUND(k.s,2) corr_spend, k.c corr_clk, k.i corr_imp, ROUND(k.s_dup,2) spend_renglon_original_dup
FROM act a FULL JOIN cruda r USING(mes,plataforma) FULL JOIN corr k USING(mes,plataforma)
ORDER BY plataforma, mes
