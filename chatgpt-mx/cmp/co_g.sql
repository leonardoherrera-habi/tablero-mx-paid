SELECT campana_original,
  ROUND(SUM(IF(FORMAT_DATE('%Y-%m',date)='2026-05',spend,0)),0) may,
  ROUND(SUM(IF(FORMAT_DATE('%Y-%m',date)='2026-06',spend,0)),0) jun,
  ROUND(SUM(IF(FORMAT_DATE('%Y-%m',date)='2026-07',spend,0)),0) jul,
  ROUND(SUM(IF(FORMAT_DATE('%Y-%m',date)='2026-08',spend,0)),0) ago,
  ROUND(SUM(IF(FORMAT_DATE('%Y-%m',date)='2026-09',spend,0)),0) sep,
  MIN(date) desde, MAX(date) hasta
FROM `papyrus-data.habi_wh_bi.resumen_inversiones_mkt_co`
WHERE plataforma='Google' AND date BETWEEN '2026-05-01' AND '2026-09-22'
GROUP BY 1 ORDER BY ago DESC
