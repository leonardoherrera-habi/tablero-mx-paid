SELECT plataforma, FORMAT_DATE('%Y-%m',date) mes, ROUND(SUM(spend),2) s FROM `papyrus-data.habi_wh_bi.resumen_inversiones_mkt_co`
WHERE (plataforma='Bing' AND date BETWEEN '2026-06-01' AND '2026-06-30') OR (plataforma='TikTok' AND date BETWEEN '2026-02-01' AND '2026-02-28') GROUP BY 1,2
