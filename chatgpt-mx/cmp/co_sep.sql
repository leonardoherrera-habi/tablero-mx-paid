SELECT plataforma, ROUND(SUM(IF(date<='2026-09-22',spend,0)),0) al22, ROUND(SUM(spend),0) al23
FROM `papyrus-data.habi_wh_bi.resumen_inversiones_mkt_co` WHERE date BETWEEN '2026-09-01' AND '2026-09-23' GROUP BY 1 ORDER BY 1
