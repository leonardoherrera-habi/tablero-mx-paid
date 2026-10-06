SELECT FORMAT_DATE('%Y-%m',date) mes, plataforma, STRING_AGG(DISTINCT moneda) moneda,
  COUNTIF(ABS(spend-conversion_usd)>0.01) spend_ne_usd,
  COUNTIF(ABS(valor_original-spend)>0.01) orig_ne_spend,
  ROUND(MIN(SAFE_DIVIDE(conversion_mxn,conversion_usd)),2) tc_mxn_min, ROUND(MAX(SAFE_DIVIDE(conversion_mxn,conversion_usd)),2) tc_mxn_max,
  ROUND(SAFE_DIVIDE(SUM(conversion_mxn),SUM(conversion_usd)),2) tc_mxn_prom,
  ROUND(SAFE_DIVIDE(SUM(conversion_cop),SUM(conversion_usd)),0) tc_cop_prom,
  ROUND(SAFE_DIVIDE(SUM(valor_original),SUM(conversion_mxn)),3) orig_sobre_mxn
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Mexico' AND date BETWEEN '2026-01-01' AND '2026-09-22' AND conversion_usd>0.05
GROUP BY 1,2 ORDER BY 2,1
