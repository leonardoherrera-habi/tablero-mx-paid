-- Tablero MX Paid Media: funnel sellers cohort + inversión paid (Google/Facebook/Bing)
-- Cohorte por fecha_creacion del lead. Día actual excluido (datos incompletos).
-- Fuentes: Web (3), Estudio Inmueble / Habímetro (7), Lead Forms (47).
--
-- Funnel: usamos las fechas denormalizadas que ya trae tabla_inmuebles_general
--   (fecha_primer_calificacion, fecha_primer_asignacion, fecha_cita_agendada,
--   fecha_cierre). Esto evita depender de tablas OLTP restringidas.
--
-- Inversión: SUM(spend, clicks, impressions) sobre resumen_inversiones_mkt_mx,
--   restringida a plataformas Google/Facebook/Bing. UTM dict mapea
--   campana_mercadeo (en TIG) → mkt_platform / mkt_campaign_name.
--
-- Atribución: spend va con fid=0 sintético (no se segrega por fuente — una
--   campaña paid puede generar leads de Web y de EI). Los leads van con su fid
--   real. En el frontend: filtros Web/EI incluyen spend; filtro LF lo excluye.

WITH

-- 1. Spend agregado: una fila por (día × plataforma × campaña).
spend_agg AS (
  SELECT
    date AS d,
    plataforma AS pl,
    COALESCE(NULLIF(campana_original, ''), NULLIF(campana, ''), '(sin campaña)') AS cmp,
    SUM(impressions) AS imp,
    SUM(clicks) AS clk,
    SUM(spend) AS spend
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx`
  WHERE date >= '2025-01-01'
    AND date < CURRENT_DATE()
    AND plataforma IN ('Google', 'Facebook', 'Bing')
  GROUP BY d, pl, cmp
),

-- 2. UTM dict: mapea campana_mercadeo_original → plataforma + campaña limpia.
dict AS (
  SELECT
    campana_mercadeo_original,
    mkt_platform AS pl,
    mkt_campaign_name AS cmp
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  WHERE mkt_platform IN ('Google', 'Facebook', 'Bing')
),

-- 3. Funnel agregado por (día × fuente × plataforma × campaña), usando las
--    fechas que ya trae TIG denormalizada. Para Web/EI: enriquecemos con
--    plataforma/campaña vía UTM dict. Para LF: pl/cmp = NULL (sin desglose).
funnel_agg AS (
  SELECT
    DATE(tig.fecha_creacion) AS d,
    tig.fuente_id AS fid,
    CASE WHEN tig.fuente_id IN (3, 7) THEN d.pl  ELSE NULL END AS pl,
    CASE WHEN tig.fuente_id IN (3, 7) THEN d.cmp ELSE NULL END AS cmp,
    COUNT(DISTINCT tig.nid) AS cre,
    COUNTIF(tig.fecha_primer_calificacion IS NOT NULL) AS cal,
    COUNTIF(tig.fecha_primer_asignacion   IS NOT NULL) AS asg,
    COUNTIF(tig.fecha_cita_agendada       IS NOT NULL) AS cit,
    COUNTIF(tig.fecha_cierre              IS NOT NULL) AS cie
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` tig
  LEFT JOIN dict d ON d.campana_mercadeo_original = tig.campana_mercadeo
  WHERE tig.fecha_creacion IS NOT NULL
    AND DATE(tig.fecha_creacion) >= '2025-01-01'
    AND DATE(tig.fecha_creacion) < CURRENT_DATE()
    AND tig.fuente_id IN (3, 7, 47)
    AND tig.nid IS NOT NULL
  GROUP BY d, fid, pl, cmp
)

-- 4. UNION ALL: spend rows (fid=0) + lead rows (fid real).
SELECT
  CAST(d AS STRING) AS d,
  0 AS fid,           -- spend sintético
  pl, cmp,
  CAST(IFNULL(imp, 0) AS INT64) AS imp,
  CAST(IFNULL(clk, 0) AS INT64) AS clk,
  ROUND(IFNULL(spend, 0), 2) AS spend,
  0 AS cre, 0 AS cal, 0 AS asg, 0 AS cit, 0 AS cie
FROM spend_agg

UNION ALL

SELECT
  CAST(d AS STRING) AS d,
  fid, pl, cmp,
  0 AS imp, 0 AS clk, 0.0 AS spend,
  cre, cal, asg, cit, cie
FROM funnel_agg

ORDER BY d, fid, pl, cmp
