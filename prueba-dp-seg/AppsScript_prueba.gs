/**
 * Llena la hoja "Prueba Meta DP vs SEG" desde BigQuery cada 3 horas, en
 * servidores de Google. Misma receta que el tablero de ChatGPT Ads.
 *
 * GENERADO desde query_prueba_dp_seg.sql: si cambias la query, edita el .sql
 * y vuelve a generar este archivo (ver README). No edites el SQL aquí a mano.
 *
 * INSTALACIÓN (una sola vez, ~5 minutos)
 * --------------------------------------
 * 1. Crea una hoja de Google vacía, por ejemplo "Prueba Meta DP vs SEG".
 * 2. Extensiones -> Apps Script. Pega este archivo completo.
 * 3. Servicios (+) -> BigQuery API -> Agregar.
 * 4. Corre `actualizar` una vez a mano y autoriza con tu cuenta. Revisa que
 *    la hoja se llene (antes del 2-dic trae 2 filas en ceros con la fecha de ayer).
 * 5. Corre `instalarDisparador` una vez: agenda la corrida cada 3 horas.
 * 6. Compartir -> Cualquier persona con el enlace -> Lector. El tablero lee la
 *    hoja como CSV; solo trae conteos y gasto, sin datos de personas.
 * 7. Pega el id de la hoja en SHEET_ID de prueba-dp-seg/index.html.
 */

var PROJECT_ID = 'papyrus-data-mx';
var NOMBRE_HOJA = null;   // null = la primera pestaña

var COLUMNAS = ['fecha', 'grupo', 'campana', 'gasto_usd', 'impresiones', 'clics', 'leads',
  'fuera_zona', 'repetidos', 'ask_price', 'calificados', 'calif_mm_inmo', 'calif_inmo',
  'asignados', 'citas', 'cierres'];
var TEXTO = 3;            // las 3 primeras columnas son texto; el resto, números

var SQL = "WITH campanas AS (\n  SELECT * FROM UNNEST([\n    STRUCT('FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612' AS campana, 'DP' AS grupo),\n    STRUCT('FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612', 'SEG')\n  ])\n),\ndias AS (\n  SELECT d FROM UNNEST(GENERATE_DATE_ARRAY(\n    LEAST(DATE '2026-12-01', DATE_SUB(CURRENT_DATE('America/Mexico_City'), INTERVAL 1 DAY)),\n    DATE_SUB(CURRENT_DATE('America/Mexico_City'), INTERVAL 1 DAY))) AS d\n),\ngasto AS (\n  SELECT i.date AS d, IF(i.campana_original = 'FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'DP', 'SEG') AS grupo,\n         SUM(i.spend) AS gasto_usd, SUM(i.impressions) AS impresiones, SUM(i.clicks) AS clics\n  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` i\n  WHERE i.campana_original IN ('FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612')\n    AND i.date >= DATE '2026-12-01'\n  GROUP BY 1, 2\n),\nleads AS (\n  SELECT g.nid, IF(g.campana_mercadeo = 'FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'DP', 'SEG') AS grupo, DATE(g.fecha_creacion) AS d_reg, DATE(g.fecha_a_pricing) AS d_cal,\n         IF(g.fecha_a_pricing IS NULL AND g.fecha_primer_calificacion IS NULL, NULL,\n            LEAST(COALESCE(DATE(g.fecha_a_pricing), DATE '9999-12-31'),\n                  COALESCE(DATE(g.fecha_primer_calificacion), DATE '9999-12-31'))) AS d_mmi,\n         IF(g.fecha_a_pricing IS NULL, DATE(g.fecha_primer_calificacion), NULL) AS d_inmo,\n         DATE(g.fecha_cita_agendada) AS d_cit, g.zona_activa, g.telefono,\n         g.fecha_creacion\n  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` g\n  WHERE g.campana_mercadeo IN ('FB_HabiWeb_Conversiones_MX_TEST_DP_CDP_202612', 'FB_HabiWeb_Conversiones_MX_TEST_SEG_CDP_202612')\n    AND DATE(g.fecha_creacion) >= DATE '2026-12-01'\n),\ntel_hist AS (\n  SELECT p.nid, p.telefono, DATE(p.fecha_creacion) AS d\n  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` p\n  WHERE p.telefono IN (SELECT telefono FROM leads WHERE telefono IS NOT NULL AND telefono != '')\n),\nrepetidos AS (\n  SELECT DISTINCT l.nid\n  FROM leads l\n  JOIN tel_hist h ON h.telefono = l.telefono AND h.nid != l.nid\n   AND h.d < l.d_reg AND h.d >= DATE_SUB(l.d_reg, INTERVAL 180 DAY)\n),\nask AS (\n  SELECT DISTINCT nid FROM `sellers-main-prod.hubspot.deals`\n  WHERE nid IN (SELECT nid FROM leads) AND ask_price IS NOT NULL\n),\nflags AS (\n  SELECT l.*, r.nid IS NOT NULL AS es_repetido, ak.nid IS NOT NULL AS con_ask\n  FROM leads l\n  LEFT JOIN repetidos r ON r.nid = l.nid\n  LEFT JOIN ask ak ON ak.nid = l.nid\n),\nasignados AS (\n  SELECT nid, MIN(CAST(dia AS DATE)) AS d\n  FROM `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart`\n  WHERE pais = 'mexico' AND nid IN (SELECT nid FROM leads)\n  GROUP BY nid\n),\ncierres AS (\n  SELECT nid, MIN(DATE(fecha)) AS d\n  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`\n  WHERE valor = 'Cierre - Comprado' AND nid IN (SELECT nid FROM leads)\n  GROUP BY nid\n),\neventos AS (\n  SELECT l.grupo, e.etapa, e.d\n  FROM flags l\n  LEFT JOIN asignados a ON a.nid = l.nid\n  LEFT JOIN cierres ci ON ci.nid = l.nid,\n  UNNEST([\n    STRUCT('leads' AS etapa, l.d_reg AS d),\n    ('fuera_zona', IF(l.zona_activa = 0, l.d_reg, NULL)),\n    ('repetidos', IF(l.es_repetido, l.d_reg, NULL)),\n    ('ask_price', IF(l.con_ask, l.d_reg, NULL)),\n    ('calificados', l.d_cal),\n    ('calif_mm_inmo', l.d_mmi),\n    ('calif_inmo', l.d_inmo),\n    ('asignados', a.d), ('citas', l.d_cit), ('cierres', ci.d)\n  ]) AS e\n  WHERE e.d IS NOT NULL\n),\nconteos AS (\n  SELECT d, grupo,\n    COUNTIF(etapa = 'leads') AS leads, COUNTIF(etapa = 'fuera_zona') AS fuera_zona,\n    COUNTIF(etapa = 'repetidos') AS repetidos, COUNTIF(etapa = 'ask_price') AS ask_price,\n    COUNTIF(etapa = 'calificados') AS calificados, COUNTIF(etapa = 'calif_mm_inmo') AS calif_mm_inmo,\n    COUNTIF(etapa = 'calif_inmo') AS calif_inmo, COUNTIF(etapa = 'asignados') AS asignados,\n    COUNTIF(etapa = 'citas') AS citas, COUNTIF(etapa = 'cierres') AS cierres\n  FROM eventos GROUP BY 1, 2\n)\nSELECT\n  FORMAT_DATE('%Y-%m-%d', dd.d) AS fecha, c.grupo, c.campana,\n  ROUND(COALESCE(g.gasto_usd, 0), 2) AS gasto_usd,\n  COALESCE(g.impresiones, 0) AS impresiones, COALESCE(g.clics, 0) AS clics,\n  COALESCE(k.leads, 0) AS leads, COALESCE(k.fuera_zona, 0) AS fuera_zona,\n  COALESCE(k.repetidos, 0) AS repetidos, COALESCE(k.ask_price, 0) AS ask_price,\n  COALESCE(k.calificados, 0) AS calificados, COALESCE(k.calif_mm_inmo, 0) AS calif_mm_inmo,\n  COALESCE(k.calif_inmo, 0) AS calif_inmo, COALESCE(k.asignados, 0) AS asignados,\n  COALESCE(k.citas, 0) AS citas, COALESCE(k.cierres, 0) AS cierres\nFROM dias dd\nCROSS JOIN campanas c\nLEFT JOIN gasto g ON g.d = dd.d AND g.grupo = c.grupo\nLEFT JOIN conteos k ON k.d = dd.d AND k.grupo = c.grupo\nORDER BY fecha, grupo";


function actualizar() {
  var filas = consultarBigQuery_(SQL);
  // Cero filas casi siempre es un error disfrazado: no se toca la hoja.
  if (!filas.length) throw new Error('BigQuery devolvió cero filas — no se toca la hoja.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = NOMBRE_HOJA ? ss.getSheetByName(NOMBRE_HOJA) : ss.getSheets()[0];
  if (!hoja) throw new Error('No encontré la pestaña destino.');

  var datos = [COLUMNAS].concat(filas);
  var ultima = hoja.getLastRow();
  if (ultima > datos.length) {
    hoja.getRange(datos.length + 1, 1, ultima - datos.length, hoja.getLastColumn()).clearContent();
  }
  hoja.getRange(1, 1, datos.length, COLUMNAS.length).setValues(datos);
  Logger.log('Actualizadas ' + filas.length + ' filas.');
}


function consultarBigQuery_(sql) {
  var res = BigQuery.Jobs.query({ query: sql, useLegacySql: false, timeoutMs: 60000 }, PROJECT_ID);
  var jobId = res.jobReference.jobId, location = res.jobReference.location, esperas = 0;
  while (!res.jobComplete && esperas < 20) {
    Utilities.sleep(3000);
    res = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, { location: location });
    esperas++;
  }
  if (!res.jobComplete) throw new Error('El job de BigQuery no terminó a tiempo.');
  var filas = [], pageToken = null;
  do {
    if (pageToken) res = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, { location: location, pageToken: pageToken });
    (res.rows || []).forEach(function (r) {
      filas.push(r.f.map(function (c, i) { return i < TEXTO ? c.v : Number(c.v); }));
    });
    pageToken = res.pageToken;
  } while (pageToken);
  return filas;
}


function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualizarConAviso') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarConAviso').timeBased().everyHours(3).create();
  Logger.log('Disparador instalado: cada 3 horas.');
}


// Avisa por correo al dueño del script si la actualización falla.
function actualizarConAviso() {
  try {
    actualizar();
  } catch (e) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'Falló la actualización del tablero Prueba Meta DP vs SEG',
      'La hoja no se pudo actualizar desde BigQuery.\n\nError: ' + e.message +
      '\n\nEl tablero sigue mostrando los últimos datos buenos.');
    throw e;
  }
}
