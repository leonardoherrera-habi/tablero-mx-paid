-- =====================================================================
-- Benchmark de CPQL y CPLA por canal — WEB Paid México, enero-agosto 2026
--
-- Mismo periodo y mismo alcance que el benchmark de CPQL que ya vive en
-- `chatgpt-mx/index.html`. Se calculan LOS DOS a proposito: si el CPQL que
-- sale aqui reproduce el que ya esta publicado, el metodo es correcto y el
-- CPLA se puede creer. Si no, hay que revisar antes de usarlo.
--
-- Decisiones que importan:
--
--   * Asignados salen del WBR mart, no de `fecha_primer_asignacion`. Es la
--     misma fuente que usa el tablero de ChatGPT, asi que los numeros son
--     comparables. Las dos fuentes dan cifras distintas.
--   * Solo WEB (`fuente_id = 3`). Lead Forms y Estudio Inmueble quedan fuera.
--   * Sin JOIN al diccionario UTM: es una tabla externa sobre Sheets y la
--     organizacion bloquea el scope de Drive. La clasificacion por tokens del
--     nombre es la misma de `query_sheet_ask_price.sql`, ya probada.
--   * El gasto de `resumen_inversiones_mkt_mx` esta en DOLARES.
--   * Las campañas de marca de Search se excluyen: con marca el CPQL de Search
--     baja de 18 a 4 dolares y cualquier comparacion se rompe.
-- =====================================================================

WITH
-- ---------- clasificacion compartida ----------
-- El mismo arbol para gasto y leads; lo unico que cambia es la columna.
gasto AS (
  SELECT
    CASE
      WHEN LOWER(campana_original) LIKE '%brand%'            THEN 'EXCLUIR marca'
      WHEN STARTS_WITH(LOWER(campana_original), 'fb_')       THEN 'Meta'
      WHEN LOWER(campana_original) LIKE '%-mta-%'            THEN 'Meta'
      WHEN LOWER(campana_original) LIKE '%tiktok%'           THEN 'TikTok'
      WHEN LOWER(campana_original) LIKE '%-tka-%'            THEN 'TikTok'
      WHEN LOWER(campana_original) LIKE '%gdg%'              THEN 'Google Demand Gen'
      WHEN LOWER(campana_original) LIKE '%performance_max%'  THEN 'Google P Max'
      WHEN LOWER(campana_original) LIKE '%gpm%'              THEN 'Google P Max'
      WHEN LOWER(campana_original) LIKE '%gsr%'              THEN 'Google Search'
      WHEN LOWER(campana_original) LIKE '%sem%'              THEN 'Google Search'
      WHEN STARTS_WITH(LOWER(campana_original), 'bing_')     THEN 'Google Search'
      WHEN LOWER(campana_original) LIKE '%-gga-%'            THEN 'Google Search'
      ELSE 'Otros'
    END AS canal,
    SUM(spend) AS spend_usd
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx`
  WHERE date BETWEEN DATE '2026-01-01' AND DATE '2026-08-31'
    AND campana_original IS NOT NULL
    -- Solo gasto de campañas WEB. Los leads ya estan filtrados a fuente_id=3,
    -- asi que contar el gasto de Lead Forms y Messenger inflaba el costo de
    -- Meta y de Search. Es la razon por la que P Max y Demand Gen cuadraban
    -- con el benchmark publicado y esos dos no: P Max y Demand Gen son solo web.
    AND LOWER(campana_original) NOT LIKE '%leadads%'
    AND LOWER(campana_original) NOT LIKE '%leadform%'
    AND LOWER(campana_original) NOT LIKE '%-lfr-%'
    AND LOWER(campana_original) NOT LIKE '%messenger%'
  GROUP BY 1
),

leads AS (
  SELECT
    CASE
      WHEN LOWER(t.campana_mercadeo) LIKE '%brand%'           THEN 'EXCLUIR marca'
      WHEN STARTS_WITH(LOWER(t.campana_mercadeo), 'fb_')      THEN 'Meta'
      WHEN LOWER(t.campana_mercadeo) LIKE '%-mta-%'           THEN 'Meta'
      WHEN LOWER(t.campana_mercadeo) LIKE '%tiktok%'          THEN 'TikTok'
      WHEN LOWER(t.campana_mercadeo) LIKE '%-tka-%'           THEN 'TikTok'
      WHEN LOWER(t.campana_mercadeo) LIKE '%gdg%'             THEN 'Google Demand Gen'
      WHEN LOWER(t.campana_mercadeo) LIKE '%performance_max%' THEN 'Google P Max'
      WHEN LOWER(t.campana_mercadeo) LIKE '%gpm%'             THEN 'Google P Max'
      WHEN LOWER(t.campana_mercadeo) LIKE '%gsr%'             THEN 'Google Search'
      WHEN LOWER(t.campana_mercadeo) LIKE '%sem%'             THEN 'Google Search'
      WHEN STARTS_WITH(LOWER(t.campana_mercadeo), 'bing_')    THEN 'Google Search'
      WHEN LOWER(t.campana_mercadeo) LIKE '%-gga-%'           THEN 'Google Search'
      ELSE 'Otros'
    END AS canal,
    COUNT(DISTINCT t.nid)                                     AS registros,
    -- Calificado = llego a pricing (definicion de Camilo desde el 29-oct-2026).
    COUNTIF(t.fecha_a_pricing IS NOT NULL)                    AS calificados,
    COUNT(DISTINCT IF(a.nid IS NOT NULL, t.nid, NULL))        AS asignados
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` t
  LEFT JOIN `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart` a
    ON t.nid = a.nid
  WHERE DATE(t.fecha_creacion) BETWEEN DATE '2026-01-01' AND DATE '2026-08-31'
    AND t.fuente_id = 3
    AND t.campana_mercadeo IS NOT NULL
  GROUP BY 1
)

SELECT
  g.canal,
  ROUND(g.spend_usd, 0)                        AS inversion_usd,
  l.registros,
  l.calificados,
  l.asignados,
  ROUND(SAFE_DIVIDE(g.spend_usd, l.registros),   2) AS cpl_usd,
  ROUND(SAFE_DIVIDE(g.spend_usd, l.calificados), 2) AS cpql_usd,
  ROUND(SAFE_DIVIDE(g.spend_usd, l.asignados),   2) AS cpla_usd,
  ROUND(SAFE_DIVIDE(l.calificados, l.registros) * 100, 1) AS pct_reg_a_calif,
  ROUND(SAFE_DIVIDE(l.asignados,   l.calificados) * 100, 1) AS pct_calif_a_asig
FROM gasto g
JOIN leads l USING (canal)
WHERE g.canal NOT IN ('Otros', 'EXCLUIR marca')
ORDER BY cpla_usd
