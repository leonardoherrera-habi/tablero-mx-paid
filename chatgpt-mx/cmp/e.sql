SELECT campana_original, spend, clicks, impressions, region, region_codigo, region_campana, area_metropolitana_id, area_metropolitana, fuente, valor_original, moneda, conversion_mxn
FROM `papyrus-master.sellers_comercial_global_dwh.sellers_inversion_marketing_regiones_global_dwh`
WHERE pais='Mexico' AND date='2026-08-10' AND campana_original IN ('aw_tuhabi_mx_performance_max_nal_max_conv_price','aw_tuhabi_mx_performance_max_nal_max_conv_2_1')
ORDER BY 1, area_metropolitana
