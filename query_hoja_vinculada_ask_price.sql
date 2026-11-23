-- =====================================================================
-- Consulta de la HOJA VINCULADA que alimenta ask_price_dashboard_v2.html
--   Hoja: ask-price-data-prod  (1_lYIa34n-L4v2PNsEL3Vjx_5YLRQEJFWDRJ-6K-Fu1Y)
--   Pestaña "Hoja vinculada 1", gid 204886809 — Connected Sheets sobre BigQuery.
--
-- Ojo: ésta es la consulta que corre en producción, NO query_sheet_ask_price.sql
-- (esa otra es una propuesta con fuente_id = 3 y taxonomía nueva que nunca se
-- llegó a poner en la hoja).
--
-- 23-nov-2026: se agregan `campana` y `anuncio` (utm_content de HubSpot) para el
-- detalle por anuncio del tablero. Las filas pasan a ser fecha × canal × fuente
-- × campaña × anuncio; el tablero vuelve a sumar para las vistas por canal, así
-- que los totales no cambian. Clasificación de canal y fuente: idéntica a la
-- versión anterior.
-- =====================================================================
WITH leads_base AS (
  SELECT
    t.nid, DATE(t.fecha_creacion) AS fecha,
    CASE
      WHEN t.campana_mercadeo LIKE 'FB_%LeadAds%' THEN 'Meta'
      WHEN t.campana_mercadeo LIKE 'FB_%' THEN 'Meta'
      WHEN t.campana_mercadeo LIKE '%gdg%' THEN 'Google Demand Gen'
      WHEN t.campana_mercadeo LIKE '%performance_max%' THEN 'Google P Max'
      WHEN t.campana_mercadeo LIKE '%sem%' OR t.campana_mercadeo LIKE 'bing_%' THEN 'Google Search'
      ELSE 'Otros'
    END AS canal,
    CASE
      WHEN t.campana_mercadeo LIKE 'FB_%LeadAds%' THEN 'LeadForm'
      ELSE 'Web'
    END AS fuente,
    t.campana_mercadeo AS campana,
    IFNULL(NULLIF(TRIM(hd.utm_content), ''), '(sin anuncio)') AS anuncio,
    hd.ask_price
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` t
  LEFT JOIN `sellers-main-prod.hubspot.deals` hd ON hd.nid = t.nid
  WHERE DATE(t.fecha_creacion) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
    AND t.campana_mercadeo IS NOT NULL
    AND LOWER(t.campana_mercadeo) NOT LIKE '%habimetro%'
)
SELECT fecha, canal, fuente,
  COUNT(DISTINCT nid) AS total_leads,
  COUNTIF(ask_price IS NOT NULL) AS leads_with_price,
  COUNTIF(ask_price IS NULL) AS leads_without_price,
  ROUND(100.0 * COUNTIF(ask_price IS NULL) / COUNT(DISTINCT nid), 2) AS pct_without_price,
  campana, anuncio
FROM leads_base
WHERE canal != 'Otros'
GROUP BY fecha, canal, fuente, campana, anuncio
ORDER BY fecha DESC, canal, fuente, campana, anuncio
