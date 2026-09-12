-- =====================================================================
-- Tablero ChatGPT Ads MX - query final
-- Cambios vs. la version validada:
--   a) inv ahora tiene dos fuentes con prioridad (conector > manual)
--   b) etiquetado desde el diccionario UTM con CASE de respaldo
--   c) fecha_inicio parametrizada para excluir el lead de prueba
-- =====================================================================

DECLARE fecha_inicio DATE DEFAULT DATE '2026-09-08';  -- lead de prueba incluido.
                                                      -- Cambiar al dia que prendas
                                                      -- la campana para arrancar limpio.

WITH
-- --- INVERSION ---------------------------------------------------------
inv_conector AS (
  SELECT date AS dia, SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impresiones
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx`
  WHERE LOWER(COALESCE(campana_original,'')) LIKE '%hatgpt%'
  GROUP BY 1
),
inv_manual AS (
  SELECT date AS dia, SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impresiones
  FROM `papyrus-data-mx.habi_wh_bi.mkt_chatgpt_spend_mx`
  WHERE LOWER(COALESCE(campana_original, campana, '')) LIKE '%hatgpt%'
  GROUP BY 1
),
inv_union AS (
  SELECT dia, spend, clicks, impresiones, 'conector' AS fuente_gasto FROM inv_conector
  UNION ALL
  SELECT dia, spend, clicks, impresiones, 'manual'   AS fuente_gasto FROM inv_manual
),
-- Si un dia existe en ambas, gana el conector. Asi la migracion no
-- requiere tocar la query: se deja de cargar la manual y ya.
inv AS (
  SELECT * EXCEPT(rn) FROM (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY dia ORDER BY IF(fuente_gasto = 'conector', 0, 1)
    ) AS rn
    FROM inv_union
  )
  WHERE rn = 1
),

-- --- ETIQUETADO --------------------------------------------------------
dic AS (
  SELECT
    campana_mercadeo_original,
    ANY_VALUE(mkt_platform)       AS mkt_platform,
    ANY_VALUE(mkt_channel_big)    AS mkt_channel_big,
    ANY_VALUE(mkt_channel_medium) AS mkt_channel_medium,
    ANY_VALUE(mkt_media)          AS mkt_media
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  GROUP BY 1
),

-- --- CIERRES -----------------------------------------------------------
cierres AS (
  SELECT nid, DATE(fecha) AS dia_cierre
  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`
  WHERE valor = 'Cierre - Comprado'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY nid ORDER BY fecha DESC) = 1
),

-- --- LEADS -------------------------------------------------------------
leads AS (
  SELECT
    DATE(g.fecha_creacion) AS dia,
    -- CASE de respaldo: mientras la UTM no este en el diccionario,
    -- el tablero se etiqueta solo por nombre de campana.
    COALESCE(d.mkt_platform,
             IF(LOWER(g.campana_mercadeo) LIKE '%hatgpt%', 'Chatgpt', 'Sin clasificar')) AS mkt_platform,
    COALESCE(d.mkt_channel_medium,
             IF(LOWER(g.campana_mercadeo) LIKE '%hatgpt%', 'WEB Paid', 'Sin clasificar')) AS mkt_channel_medium,
    COUNT(DISTINCT g.nid)                                AS registros,
    COUNTIF(g.fecha_primer_calificacion IS NOT NULL)     AS calificados,
    COUNT(DISTINCT IF(asi.nid IS NOT NULL, g.nid, NULL)) AS asignados,
    COUNTIF(g.fecha_cita_agendada IS NOT NULL)           AS citas_agendadas,
    COUNT(DISTINCT IF(c.nid   IS NOT NULL, g.nid, NULL)) AS cierres
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` g
  LEFT JOIN `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart` asi
    ON g.nid = asi.nid
  LEFT JOIN cierres c ON g.nid = c.nid
  LEFT JOIN dic d     ON g.campana_mercadeo = d.campana_mercadeo_original
  WHERE LOWER(COALESCE(g.campana_mercadeo,'')) LIKE '%hatgpt%'
    AND DATE(g.fecha_creacion) >= fecha_inicio
  GROUP BY 1, 2, 3
)

SELECT
  COALESCE(i.dia, l.dia) AS dia,
  l.mkt_platform,
  l.mkt_channel_medium,
  i.fuente_gasto,
  i.spend, i.clicks, i.impresiones,
  l.registros, l.calificados, l.asignados, l.citas_agendadas, l.cierres,
  ROUND(SAFE_DIVIDE(i.spend, l.registros),   2) AS cpl,
  ROUND(SAFE_DIVIDE(i.spend, l.calificados), 2) AS cpql,
  ROUND(SAFE_DIVIDE(i.spend, l.citas_agendadas), 2) AS cpca,
  ROUND(SAFE_DIVIDE(l.calificados, l.registros) * 100, 1) AS cvr_pct,
  ROUND(SAFE_DIVIDE(i.clicks, i.impresiones) * 100, 2)    AS ctr_pct
FROM inv i
FULL OUTER JOIN leads l ON i.dia = l.dia
WHERE COALESCE(i.dia, l.dia) >= fecha_inicio
ORDER BY 1 DESC;

-- NOTA PARA EL TABLERO: la columna de cierres va a ser cero los primeros
-- dos meses y eso no significa nada. El ciclo calificacion -> cierre en MX
-- es de 49 dias de mediana y 130 en el p90.
