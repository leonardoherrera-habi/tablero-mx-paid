-- Tablero MX Paid Media: funnel sellers cohort + inversión paid (Google/Facebook/Bing)
-- Cohorte por fecha_creacion del lead. Día actual excluido (datos incompletos).
-- Fuentes: Web (3), Estudio Inmueble / Habímetro (7), Lead Forms (47), Otros (0).
--
-- Funnel: usamos las fechas denormalizadas que ya trae tabla_inmuebles_general
--   (fecha_primer_calificacion, fecha_primer_asignacion, fecha_cita_agendada,
--   fecha_cierre). Esto evita depender de tablas OLTP restringidas.
--
-- Inversión: SUM(spend, clicks, impressions) sobre resumen_inversiones_mkt_mx,
--   restringida a plataformas Google/Facebook/Bing. UTM dict mapea
--   campana_mercadeo (en TIG) → mkt_platform / mkt_campaign_name / mkt_channel_big.
--
-- Atribución (alineada con tablero de Camilo Otoya, llave: mkt_channel_big):
--   * SPEND: cada campaña paid se clasifica por mkt_channel_big de su entrada en
--     UTM dict (WEB → 3, Estudio Inmueble → 7, Lead Forms → 47, Brand/Propiedades
--     /no-match → 0 "Otros").
--   * LEADS: se reasigna fid usando mkt_channel_big de la campana_mercadeo del
--     LEAD (no del fuente_id de TIG). Replica el CASE de Camilo en m_mkt_channel_big.
--     Si campana_mercadeo es NULL/''/'xxxxx' o no matchea dict, fallback al
--     fuente_id de TIG. Esto cuadra con el tablero actual y permite ver Lead Forms
--     como universo aparte aunque el lead haya caído como WEB en TIG.

WITH

-- 1. Clasificación de campañas paid → fuente nativa + sub-fuente.
--    Match: resumen_inversiones_mkt_mx.campana_original = dict.mkt_campaign_name.
--    Labels reales en mkt_channel_big: WEB, Lead Forms, Estudio Inmueble, Brand,
--    Propiedades. Solo las 3 primeras tienen fuente equivalente en TIG.
--    sub = mkt_channel_medium (ej. "WEB Paid", "Estudio Inmueble Paid",
--    "Lead Forms Paid", "Brand Paid"…). ANY_VALUE para protegerse si una
--    campaña tuviera valores inconsistentes en el dict.
cmp_to_class AS (
  SELECT
    mkt_campaign_name AS cmp,
    ANY_VALUE(
      CASE
        WHEN mkt_channel_big = 'WEB'              THEN 3
        WHEN mkt_channel_big = 'Estudio Inmueble' THEN 7
        WHEN mkt_channel_big = 'Lead Forms'       THEN 47
        ELSE 0
      END
    ) AS fid,
    ANY_VALUE(mkt_channel_medium) AS sub
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  WHERE mkt_campaign_name IS NOT NULL
  GROUP BY mkt_campaign_name
),

-- 2. Spend agregado: una fila por (día × plataforma × campaña × fid × sub).
spend_agg AS (
  SELECT
    i.date AS d,
    i.plataforma AS pl,
    COALESCE(NULLIF(i.campana_original, ''), NULLIF(i.campana, ''), '(sin campaña)') AS cmp,
    COALESCE(c.fid, 0) AS fid,
    COALESCE(NULLIF(c.sub, ''), '(sin sub-fuente)') AS sub,
    SUM(i.impressions) AS imp,
    SUM(i.clicks) AS clk,
    SUM(i.spend) AS spend
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` i
  LEFT JOIN cmp_to_class c ON c.cmp = i.campana_original
  WHERE i.date >= '2025-01-01'
    AND i.date < CURRENT_DATE()
    AND i.plataforma IN ('Google', 'Facebook', 'Bing')
  GROUP BY d, pl, cmp, fid, sub
),

-- 3. UTM dict para enriquecer leads con plataforma + campaña + canal big + medium.
--    Una fila por campana_mercadeo_original. ANY_VALUE para colapsar duplicados
--    si el dict tiene varias entradas para la misma campaña.
dict AS (
  SELECT
    campana_mercadeo_original,
    ANY_VALUE(mkt_platform)       AS pl,
    ANY_VALUE(mkt_campaign_name)  AS cmp,
    ANY_VALUE(mkt_channel_big)    AS channel_big,
    ANY_VALUE(mkt_channel_medium) AS channel_medium
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  WHERE campana_mercadeo_original IS NOT NULL
  GROUP BY campana_mercadeo_original
),

-- 4. Funnel agregado por (día × fid reasignado × plataforma × campaña × sub).
--    fid del lead se reetiqueta por mkt_channel_big del dict (lógica Camilo):
--      campana_mercadeo NULL/''/'xxxxx' → fuente_id original de TIG
--      mkt_channel_big = 'WEB'              → 3
--      mkt_channel_big = 'Estudio Inmueble' → 7
--      mkt_channel_big = 'Lead Forms'       → 47
--      mkt_channel_big in ('Brand','Propiedades') → 0 (Otros)
--      otro / no-match dict → fuente_id original de TIG
--
--    sub-fuente (replica m_mkt_channel_medium de Camilo):
--      campana_mercadeo NULL/''/'xxxxx':
--        - fuente_id 47 (LF) → 'Lead Forms Paid'
--        - fuente_id 3 (WEB) → 'WEB Direct'
--        - fuente_id 7 (EI)  → 'Estudio Inmueble Direct'
--      con campaña + dict → mkt_channel_medium del dict (ej. WEB Paid /
--        WEB Community / WEB Referral)
--      con campaña pero sin match dict → la campana_mercadeo cruda
--
--    Universo: tig.fuente_id IN (3,7,47) — se mantiene el filtro para no
--    arrastrar fuentes orgánicas no-paid (20, 35, 39, 46…).
funnel_agg AS (
  SELECT
    DATE(tig.fecha_creacion) AS d,
    CASE
      WHEN tig.campana_mercadeo IS NULL
        OR tig.campana_mercadeo IN ('', 'xxxxx')          THEN tig.fuente_id
      WHEN d.channel_big = 'WEB'                          THEN 3
      WHEN d.channel_big = 'Estudio Inmueble'             THEN 7
      WHEN d.channel_big = 'Lead Forms'                   THEN 47
      WHEN d.channel_big IN ('Brand', 'Propiedades')      THEN 0
      ELSE tig.fuente_id
    END AS fid,
    d.pl  AS pl,
    d.cmp AS cmp,
    CASE
      WHEN tig.campana_mercadeo IS NULL
        OR tig.campana_mercadeo IN ('', 'xxxxx') THEN
          CASE tig.fuente_id
            WHEN 47 THEN 'Lead Forms Paid'
            WHEN 3  THEN 'WEB Direct'
            WHEN 7  THEN 'Estudio Inmueble Direct'
            ELSE 'Otros'
          END
      WHEN d.channel_medium IS NULL OR d.channel_medium = '' THEN tig.campana_mercadeo
      ELSE d.channel_medium
    END AS sub,
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
  GROUP BY d, fid, pl, cmp, sub
)

-- 5. UNION ALL: spend rows (fid 0/3/7/47 vía mkt_channel_big de la campaña paid)
--    + lead rows (fid 0/3/7/47 vía mkt_channel_big de la campaña del lead, con
--    fallback a fuente_id de TIG cuando no hay match). Ambas filas traen `sub`
--    (mkt_channel_medium) para desglose Web Paid / Web Direct / Web Community /
--    Web Referral (y equivalentes para EI / LF / Otros).
SELECT
  CAST(d AS STRING) AS d,
  fid,
  pl, cmp, sub,
  CAST(IFNULL(imp, 0) AS INT64) AS imp,
  CAST(IFNULL(clk, 0) AS INT64) AS clk,
  ROUND(IFNULL(spend, 0), 2) AS spend,
  0 AS cre, 0 AS cal, 0 AS asg, 0 AS cit, 0 AS cie
FROM spend_agg

UNION ALL

SELECT
  CAST(d AS STRING) AS d,
  fid, pl, cmp, sub,
  0 AS imp, 0 AS clk, 0.0 AS spend,
  cre, cal, asg, cit, cie
FROM funnel_agg

ORDER BY d, fid, pl, cmp, sub
