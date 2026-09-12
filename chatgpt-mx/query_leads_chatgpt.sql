-- Serie diaria completa desde el arranque, con ceros explicitos.
WITH dias AS (
  SELECT d FROM UNNEST(GENERATE_DATE_ARRAY(DATE '2026-09-07', CURRENT_DATE('America/Mexico_City'))) AS d
),
cierres AS (
  SELECT nid, DATE(fecha) AS dia_cierre
  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`
  WHERE valor = 'Cierre - Comprado'
  QUALIFY ROW_NUMBER() OVER(PARTITION BY nid ORDER BY fecha DESC) = 1
),
leads AS (
  SELECT
    DATE(g.fecha_creacion) AS dia,
    COUNT(DISTINCT g.nid)                                AS registros,
    COUNTIF(g.fecha_primer_calificacion IS NOT NULL)     AS calificados,
    COUNT(DISTINCT IF(asi.nid IS NOT NULL, g.nid, NULL)) AS asignados,
    COUNTIF(g.fecha_cita_agendada IS NOT NULL)           AS citas,
    COUNT(DISTINCT IF(c.nid IS NOT NULL, g.nid, NULL))   AS cierres
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` g
  LEFT JOIN `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart` asi
    ON g.nid = asi.nid
  LEFT JOIN cierres c ON g.nid = c.nid
  WHERE LOWER(COALESCE(g.campana_mercadeo,'')) LIKE '%hatgpt%'
  GROUP BY 1
)
SELECT
  FORMAT_DATE('%Y-%m-%d', d.d)   AS fecha,
  IFNULL(l.registros, 0)   AS registros,
  IFNULL(l.calificados, 0) AS calificados,
  IFNULL(l.asignados, 0)   AS asignados,
  IFNULL(l.citas, 0)       AS citas,
  IFNULL(l.cierres, 0)     AS cierres
FROM dias d LEFT JOIN leads l ON l.dia = d.d
ORDER BY 1
