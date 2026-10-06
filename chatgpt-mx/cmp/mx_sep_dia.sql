SELECT plataforma, date, ROUND(SUM(spend),2) s, COUNT(*) f FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Mexico' AND plataforma IN ('Bing','TikTok') AND date BETWEEN '2026-09-01' AND '2026-09-22' AND fuente IS NULL GROUP BY 1,2 ORDER BY 1,2
