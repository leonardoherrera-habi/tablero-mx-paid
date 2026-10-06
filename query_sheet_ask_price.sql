-- =====================================================================
-- Alimenta el Sheet del Ask Price Dashboard
--   Sheet: 1_lYIa34n-L4v2PNsEL3Vjx_5YLRQEJFWDRJ-6K-Fu1Y  (gid 204886809)
--   Tablero: ask_price_dashboard_v2.html
--
-- Basada en la query original de Leonardo. Dos cambios:
--
-- 1) COBERTURA. La clasificación vieja sólo entendía la nomenclatura antigua
--    (FB_*, *performance_max*), y dejaba 23.5% de los leads en 'Otros'
--    — 7,128 en 90 días. El bloque más grande eran 3,472 leads de
--    `tuh-mex-sel-pai-per-lfr-mta-mld-oto-nal-form_full_funnel`, que es
--    Meta Lead Forms con la taxonomía nueva. Ahora se reconocen ambas:
--      -mta- = Meta   -tka- = TikTok   -gga- = Google Ads
--      -lfr- = LeadForm   -web- = Web   -org- = orgánico (fuera)
--
-- 2) COLUMNAS NUEVAS al final: asignados y calificados. Añadirlas no rompe
--    el tablero — el parser lee por nombre de encabezado, no por posición.
--
-- Se puede correr con bq CLI: no toca el diccionario UTM (sin Drive scope).
-- =====================================================================

WITH leads_base AS (
  SELECT
    t.nid,
    DATE(t.fecha_creacion) AS fecha,
    LOWER(t.campana_mercadeo) AS c,

    CASE
      -- Meta: nomenclatura vieja (FB_*) y nueva (-mta-)
      WHEN STARTS_WITH(LOWER(t.campana_mercadeo), 'fb_')        THEN 'Meta'
      WHEN LOWER(t.campana_mercadeo) LIKE '%-mta-%'             THEN 'Meta'
      -- TikTok: nombre propio y código -tka-
      WHEN LOWER(t.campana_mercadeo) LIKE '%tiktok%'            THEN 'TikTok'
      WHEN LOWER(t.campana_mercadeo) LIKE '%-tka-%'             THEN 'TikTok'
      -- Google, del más específico al más general
      WHEN LOWER(t.campana_mercadeo) LIKE '%gdg%'               THEN 'Google Demand Gen'
      WHEN LOWER(t.campana_mercadeo) LIKE '%performance_max%'   THEN 'Google P Max'
      WHEN LOWER(t.campana_mercadeo) LIKE '%gpm%'               THEN 'Google P Max'
      WHEN LOWER(t.campana_mercadeo) LIKE '%gsr%'               THEN 'Google Search'
      WHEN LOWER(t.campana_mercadeo) LIKE '%sem%'               THEN 'Google Search'
      WHEN STARTS_WITH(LOWER(t.campana_mercadeo), 'bing_')      THEN 'Google Search'
      WHEN LOWER(t.campana_mercadeo) LIKE '%-gga-%'             THEN 'Google Search'
      ELSE 'Otros'
    END AS canal,

    -- Constante: el scope es solo Web. Lead Forms se excluye con fuente_id = 3.
    -- Se conserva la columna porque el tablero la muestra y la filtra.
    'Web' AS fuente,

    hd.ask_price,
    t.fecha_primer_asignacion,
    t.fecha_primer_calificacion

  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` t
  LEFT JOIN `sellers-main-prod.hubspot.deals` hd
    ON hd.nid = t.nid
  WHERE DATE(t.fecha_creacion) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
    AND DATE(t.fecha_creacion) <  CURRENT_DATE()          -- sin el día en curso
    AND t.fuente_id = 3                                   -- SOLO WEB (excluye Lead Forms 47 y Estudio Inmueble 7)
    AND t.campana_mercadeo IS NOT NULL
    AND LOWER(t.campana_mercadeo) NOT LIKE '%habimetro%'
    AND LOWER(t.campana_mercadeo) NOT LIKE '%-org-%'      -- fuera orgánico
    AND LOWER(t.campana_mercadeo) NOT LIKE '%organic%'
    AND LOWER(t.campana_mercadeo) NOT LIKE '%reinteresados%'  -- retargeting, no lead nuevo
)

SELECT
  FORMAT_DATE('%d/%m/%Y', fecha) AS fecha,
  canal,
  fuente,

  -- ── columnas que el tablero ya usa ──
  COUNT(DISTINCT nid)                                               AS total_leads,
  COUNTIF(ask_price IS NOT NULL)                                    AS leads_with_price,
  COUNTIF(ask_price IS NULL)                                        AS leads_without_price,
  ROUND(100.0 * COUNTIF(ask_price IS NULL) / COUNT(DISTINCT nid), 2) AS pct_without_price,

  -- ── nuevas: costo operativo y calidad ──
  COUNTIF(ask_price IS NULL     AND fecha_primer_asignacion IS NOT NULL) AS sin_precio_asignados,
  COUNTIF(ask_price IS NOT NULL AND fecha_primer_asignacion IS NOT NULL) AS con_precio_asignados,
  COUNTIF(fecha_primer_calificacion IS NOT NULL)                        AS calificados,
  ROUND(100.0 * COUNTIF(fecha_primer_calificacion IS NOT NULL)
        / COUNT(DISTINCT nid), 2)                                       AS pct_calificado

FROM leads_base
WHERE canal != 'Otros'
GROUP BY fecha, canal, fuente
ORDER BY fecha DESC, canal, fuente
