-- =====================================================================
-- Prueba Meta TEST_DP (señal Amplitude) vs TEST_SEG (señal Segment), MX web.
-- Solo datos internos: gasto del warehouse y funnel de nuestras tablas, no de Meta.
--
-- Una fila por día y campaña. El tablero agrega (totales, semanas, acumulados).
--
-- Definiciones: las de DEFINICIONES-MEDICION.md (WBR, MX Marketing, ChatGPT).
-- Cada etapa se cuenta el día en que ocurrió, en hora de México, sin el día de hoy.
--   gasto        resumen_inversiones_mkt_mx (USD), por campana_original
--   leads        tabla_inmuebles_general por campana_mercadeo, día de creación
--   calificados    MM: llegó a pricing (fecha_a_pricing). Es el calificado oficial
--                  de marketing y al que aplica el benchmark de CPQL.
--   calif_mm_inmo  MM + Inmo: fecha_a_pricing o fecha_primer_calificacion no nula
--                  (definición Inmo del tablero de registros por hora; MM ⊆ Inmo).
--                  Se cuenta en la primera de las dos fechas. Es lo que optimizan
--                  los dos eventos de la prueba.
--   calif_inmo     solo Inmo: fecha_primer_calificacion sin fecha_a_pricing
--   asignados    WBR mart, día de asignación
--   citas        fecha_cita_agendada;  cierres  seguimiento_funnel_mex 'Cierre - Comprado'
--   fuera_zona   leads con zona_activa = 0 (día de creación)
--   repetidos    leads cuyo teléfono ya tenía un lead (cualquier fuente) al menos un día antes
--                (en los 180 días anteriores, la misma ventana de la exclusión de Amplitude)
--   ask_price    leads con ask_price en HubSpot (día de creación)
--
-- Sin JOIN al diccionario UTM a propósito: es tabla externa sobre Sheets y
-- Apps Script / cuentas de servicio no la leen. Las dos campañas son constantes.
-- =====================================================================
DECLARE INICIO DATE DEFAULT DATE '2026-12-01';

WITH campanas AS (
  SELECT * FROM UNNEST([
    STRUCT('FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612' AS campana, 'DP' AS grupo),
    STRUCT('FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612', 'SEG')
  ])
),
dias AS (
  SELECT d FROM UNNEST(GENERATE_DATE_ARRAY(
    -- Sin el día de hoy. Antes del arranque da un solo día en ceros (no cero filas).
    LEAST(INICIO, DATE_SUB(CURRENT_DATE('America/Mexico_City'), INTERVAL 1 DAY)),
    DATE_SUB(CURRENT_DATE('America/Mexico_City'), INTERVAL 1 DAY))) AS d
),
gasto AS (
  SELECT i.date AS d, IF(i.campana_original = 'FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'DP', 'SEG') AS grupo,
         SUM(i.spend) AS gasto_usd, SUM(i.impressions) AS impresiones, SUM(i.clicks) AS clics
  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` i
  WHERE i.campana_original IN ('FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612')
    AND i.date >= INICIO
  GROUP BY 1, 2
),
leads AS (
  SELECT g.nid, IF(g.campana_mercadeo = 'FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'DP', 'SEG') AS grupo, DATE(g.fecha_creacion) AS d_reg, DATE(g.fecha_a_pricing) AS d_cal,
         IF(g.fecha_a_pricing IS NULL AND g.fecha_primer_calificacion IS NULL, NULL,
            LEAST(COALESCE(DATE(g.fecha_a_pricing), DATE '9999-12-31'),
                  COALESCE(DATE(g.fecha_primer_calificacion), DATE '9999-12-31'))) AS d_mmi,
         IF(g.fecha_a_pricing IS NULL, DATE(g.fecha_primer_calificacion), NULL) AS d_inmo,
         DATE(g.fecha_cita_agendada) AS d_cit, g.zona_activa, g.telefono,
         g.fecha_creacion
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` g
  -- Lista literal a propósito: un JOIN contra la CTE campanas (UNNEST) impide que
  -- BigQuery filtre antes de evaluar la vista y la query revienta por CPU.
  WHERE g.campana_mercadeo IN ('FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612')
    AND DATE(g.fecha_creacion) >= INICIO
),
tel_hist AS (
  -- Leads previos de los mismos teléfonos (cualquier fuente).
  SELECT p.nid, p.telefono, DATE(p.fecha_creacion) AS d
  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` p
  WHERE p.telefono IN (SELECT telefono FROM leads WHERE telefono IS NOT NULL AND telefono != '')
),
repetidos AS (
  SELECT DISTINCT l.nid
  FROM leads l
  JOIN tel_hist h ON h.telefono = l.telefono AND h.nid != l.nid
   AND h.d < l.d_reg AND h.d >= DATE_SUB(l.d_reg, INTERVAL 180 DAY)
),
ask AS (
  SELECT DISTINCT nid FROM `sellers-main-prod.hubspot.deals`
  WHERE nid IN (SELECT nid FROM leads) AND ask_price IS NOT NULL
),
flags AS (
  SELECT l.*, r.nid IS NOT NULL AS es_repetido, ak.nid IS NOT NULL AS con_ask
  FROM leads l
  LEFT JOIN repetidos r ON r.nid = l.nid
  LEFT JOIN ask ak ON ak.nid = l.nid
),
asignados AS (
  SELECT nid, MIN(CAST(dia AS DATE)) AS d
  FROM `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart`
  WHERE pais = 'mexico' AND nid IN (SELECT nid FROM leads)
  GROUP BY nid
),
cierres AS (
  SELECT nid, MIN(DATE(fecha)) AS d
  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`
  WHERE valor = 'Cierre - Comprado' AND nid IN (SELECT nid FROM leads)
  GROUP BY nid
),
eventos AS (
  SELECT l.grupo, e.etapa, e.d
  FROM flags l
  LEFT JOIN asignados a ON a.nid = l.nid
  LEFT JOIN cierres ci ON ci.nid = l.nid,
  UNNEST([
    STRUCT('leads' AS etapa, l.d_reg AS d),
    ('fuera_zona', IF(l.zona_activa = 0, l.d_reg, NULL)),
    ('repetidos', IF(l.es_repetido, l.d_reg, NULL)),
    ('ask_price', IF(l.con_ask, l.d_reg, NULL)),
    ('calificados', l.d_cal),
    ('calif_mm_inmo', l.d_mmi),
    ('calif_inmo', l.d_inmo),
    ('asignados', a.d), ('citas', l.d_cit), ('cierres', ci.d)
  ]) AS e
  WHERE e.d IS NOT NULL
),
conteos AS (
  SELECT d, grupo,
    COUNTIF(etapa = 'leads') AS leads, COUNTIF(etapa = 'fuera_zona') AS fuera_zona,
    COUNTIF(etapa = 'repetidos') AS repetidos, COUNTIF(etapa = 'ask_price') AS ask_price,
    COUNTIF(etapa = 'calificados') AS calificados, COUNTIF(etapa = 'calif_mm_inmo') AS calif_mm_inmo,
    COUNTIF(etapa = 'calif_inmo') AS calif_inmo, COUNTIF(etapa = 'asignados') AS asignados,
    COUNTIF(etapa = 'citas') AS citas, COUNTIF(etapa = 'cierres') AS cierres
  FROM eventos GROUP BY 1, 2
)
SELECT
  FORMAT_DATE('%Y-%m-%d', dd.d) AS fecha, c.grupo, c.campana,
  ROUND(COALESCE(g.gasto_usd, 0), 2) AS gasto_usd,
  COALESCE(g.impresiones, 0) AS impresiones, COALESCE(g.clics, 0) AS clics,
  COALESCE(k.leads, 0) AS leads, COALESCE(k.fuera_zona, 0) AS fuera_zona,
  COALESCE(k.repetidos, 0) AS repetidos, COALESCE(k.ask_price, 0) AS ask_price,
  COALESCE(k.calificados, 0) AS calificados, COALESCE(k.calif_mm_inmo, 0) AS calif_mm_inmo,
  COALESCE(k.calif_inmo, 0) AS calif_inmo, COALESCE(k.asignados, 0) AS asignados,
  COALESCE(k.citas, 0) AS citas, COALESCE(k.cierres, 0) AS cierres
FROM dias dd
CROSS JOIN campanas c
LEFT JOIN gasto g ON g.d = dd.d AND g.grupo = c.grupo
LEFT JOIN conteos k ON k.d = dd.d AND k.grupo = c.grupo
ORDER BY fecha, grupo
