SELECT 'nueva' t, column_name, data_type FROM `papyrus-master.sellers_comercial_global_dwh.INFORMATION_SCHEMA.COLUMNS` WHERE table_name='sellers_inversion_marketing_regiones_global_dwh'
UNION ALL
SELECT 'mx', column_name, data_type FROM `papyrus-data-mx.habi_wh_bi.INFORMATION_SCHEMA.COLUMNS` WHERE table_name='resumen_inversiones_mkt_mx'
