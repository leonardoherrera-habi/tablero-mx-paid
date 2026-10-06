WITH n AS (SELECT date, SUM(spend) s, COUNT(*) f, STRING_AGG(DISTINCT IFNULL(fuente,'NULL')) fu, COUNTIF(fuente IS NULL) fnull, SUM(IF(fuente IS NULL,spend,0)) s_null, SUM(IF(area_metropolitana="otros",spend,0)) s_otros
  FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
  WHERE pais='Mexico' AND plataforma='TikTok' AND campana_original='tuh-mex-sel-pai-per-lfr-tka-tlg-tad-nal-smrt' AND date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY 1),
v AS (SELECT date, SUM(spend) sv FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` WHERE campana_original='tuh-mex-sel-pai-per-lfr-tka-tlg-tad-nal-smrt' AND date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY 1)
SELECT date, ROUND(sv,2) actual, ROUND(s,2) nueva, ROUND(SAFE_DIVIDE(s,sv),3) ratio, f, fu, fnull, ROUND(s_null,2) s_null, ROUND(s_otros,2) otros, ROUND(s-s_otros,2) sin_otros FROM n FULL JOIN v USING(date) ORDER BY 1
