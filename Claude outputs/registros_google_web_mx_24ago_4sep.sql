-- Registros / Calificados / Asignados · WEB + plataforma Google · excl. Habímetro
-- MX · cohorte por fecha_creacion · 24-ago-2026 a 4-sep-2026
-- Definiciones tomadas de query.sql (tablero-mx-paid), consistentes con el tablero.

-- ============ TOTALES ============
WITH dict AS (
  SELECT campana_mercadeo_original, ANY_VALUE(mkt_platform) AS pl
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  WHERE campana_mercadeo_original IS NOT NULL
  GROUP BY campana_mercadeo_original
)
SELECT
  COUNT(DISTINCT tig.nid)                                   AS registros,
  COUNTIF(tig.fecha_primer_calificacion IS NOT NULL)        AS calificados,
  COUNTIF(tig.fecha_primer_asignacion   IS NOT NULL)        AS asignados
FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` tig
LEFT JOIN dict d ON d.campana_mercadeo_original = tig.campana_mercadeo
WHERE DATE(tig.fecha_creacion) BETWEEN '2026-08-24' AND '2026-09-04'
  AND tig.fuente_id = 3          -- WEB (excluye Habímetro = 7)
  AND d.pl = 'Google'           -- plataforma Google (si da 0 filas: UPPER(d.pl) LIKE '%GOOGLE%')
  AND tig.nid IS NOT NULL;

-- ============ DESGLOSE DIARIO ============
WITH dict AS (
  SELECT campana_mercadeo_original, ANY_VALUE(mkt_platform) AS pl
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  WHERE campana_mercadeo_original IS NOT NULL
  GROUP BY campana_mercadeo_original
)
SELECT
  DATE(tig.fecha_creacion)                                  AS fecha,
  COUNT(DISTINCT tig.nid)                                   AS registros,
  COUNTIF(tig.fecha_primer_calificacion IS NOT NULL)        AS calificados,
  COUNTIF(tig.fecha_primer_asignacion   IS NOT NULL)        AS asignados
FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` tig
LEFT JOIN dict d ON d.campana_mercadeo_original = tig.campana_mercadeo
WHERE DATE(tig.fecha_creacion) BETWEEN '2026-08-24' AND '2026-09-04'
  AND tig.fuente_id = 3
  AND d.pl = 'Google'
  AND tig.nid IS NOT NULL
GROUP BY fecha
ORDER BY fecha;
