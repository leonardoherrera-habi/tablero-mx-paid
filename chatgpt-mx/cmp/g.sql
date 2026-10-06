-- Corrección: 1) si la campaña-día fue prorrateada por área (fuente no nula), descartar la fila original "sin area";
-- 2) clics/impresiones: tomar el valor de campaña-día una sola vez (MAX), salvo Facebook que trae región real.
WITH base AS (
  SELECT *, COUNTIF(fuente IS NOT NULL) OVER (PARTITION BY date, plataforma, campana_original) n_prorr
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND date>='2026-01-01'),
limpio AS (SELECT * FROM base WHERE NOT (n_prorr>0 AND fuente IS NULL)),
cd AS (
  SELECT date, plataforma, campana_original, SUM(spend) usd, SUM(conversion_mxn) mxn,
    IF(plataforma='Facebook', SUM(clicks), MAX(clicks)) clk
  FROM limpio GROUP BY 1,2,3),
clk_orig AS ( -- clics de la fila original cuando la prorrateada viene NULL
  SELECT date, plataforma, campana_original, MAX(clicks) clk FROM base GROUP BY 1,2,3),
n AS (SELECT FORMAT_DATE('%Y-%m',cd.date) mes, cd.plataforma, SUM(usd) usd_n, SUM(mxn) mxn_n, SUM(IF(cd.plataforma='Facebook',cd.clk,o.clk)) clk_n
  FROM cd JOIN clk_orig o USING(date,plataforma,campana_original) GROUP BY 1,2),
v AS (SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, SUM(spend) usd_v, SUM(clicks) clk_v
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` WHERE date>='2026-01-01' GROUP BY 1,2)
SELECT mes, plataforma, ROUND(usd_v,0) usd_actual, ROUND(usd_n,0) usd_nueva_corr, ROUND(SAFE_DIVIDE(usd_n,usd_v)-1,4) dif, ROUND(mxn_n,0) mxn_nueva, clk_v, clk_n
FROM n FULL JOIN v USING(mes,plataforma) ORDER BY plataforma, mes
