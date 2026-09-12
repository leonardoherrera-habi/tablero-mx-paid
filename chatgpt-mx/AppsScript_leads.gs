/**
 * Llena la hoja "Leads ChatGPT Ads MX" desde BigQuery, sola, en servidores de
 * Google. No depende de que la laptop este prendida ni de sesiones que expiran.
 *
 * INSTALACION (una sola vez, ~5 minutos)
 * --------------------------------------
 * 1. Abre la hoja de Leads -> Extensiones -> Apps Script.
 * 2. Pega este archivo completo, reemplazando lo que haya.
 * 3. En el panel izquierdo: Servicios (+) -> BigQuery API -> Agregar.
 * 4. Corre `actualizarLeads` una vez a mano. Google va a pedir permisos:
 *    autoriza con leonardoherrera@tuhabi.mx. Revisa que la hoja se llene.
 * 5. Corre `instalarDisparador` una vez. Eso agenda la corrida cada 3 horas.
 *
 * Para verificar despues: Apps Script -> Ejecuciones. Ahi se ve cada corrida,
 * si fallo y por que.
 */

var PROJECT_ID = 'papyrus-data-mx';
var NOMBRE_HOJA = null;   // null = la primera pestaña
var INICIO = '2026-09-07';

var SQL =
  "WITH dias AS (\n" +
  "  SELECT d FROM UNNEST(GENERATE_DATE_ARRAY(DATE '" + INICIO + "', CURRENT_DATE('America/Mexico_City'))) AS d\n" +
  "),\n" +
  "cierres AS (\n" +
  "  SELECT nid\n" +
  "  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`\n" +
  "  WHERE valor = 'Cierre - Comprado'\n" +
  "  QUALIFY ROW_NUMBER() OVER(PARTITION BY nid ORDER BY fecha DESC) = 1\n" +
  "),\n" +
  "leads AS (\n" +
  "  SELECT\n" +
  "    DATE(g.fecha_creacion) AS dia,\n" +
  "    COUNT(DISTINCT g.nid)                                AS registros,\n" +
  "    COUNTIF(g.fecha_primer_calificacion IS NOT NULL)     AS calificados,\n" +
  "    COUNT(DISTINCT IF(asi.nid IS NOT NULL, g.nid, NULL)) AS asignados,\n" +
  "    COUNTIF(g.fecha_cita_agendada IS NOT NULL)           AS citas,\n" +
  "    COUNT(DISTINCT IF(c.nid IS NOT NULL, g.nid, NULL))   AS cierres\n" +
  "  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` g\n" +
  "  LEFT JOIN `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart` asi\n" +
  "    ON g.nid = asi.nid\n" +
  "  LEFT JOIN cierres c ON g.nid = c.nid\n" +
  // Sin JOIN al diccionario UTM a proposito: es una tabla externa sobre Sheets
  // y la organizacion bloquea el scope de Drive para cuentas de servicio.
  // Es una sola campaña, asi que el LIKE basta y elimina esa dependencia.
  "  WHERE LOWER(COALESCE(g.campana_mercadeo,'')) LIKE '%hatgpt%'\n" +
  "  GROUP BY 1\n" +
  ")\n" +
  "SELECT\n" +
  "  FORMAT_DATE('%Y-%m-%d', d.d)   AS fecha,\n" +
  "  IFNULL(l.registros, 0)   AS registros,\n" +
  "  IFNULL(l.calificados, 0) AS calificados,\n" +
  "  IFNULL(l.asignados, 0)   AS asignados,\n" +
  "  IFNULL(l.citas, 0)       AS citas,\n" +
  "  IFNULL(l.cierres, 0)     AS cierres\n" +
  "FROM dias d LEFT JOIN leads l ON l.dia = d.d\n" +
  "ORDER BY 1";


function actualizarLeads() {
  var filas = consultarBigQuery_(SQL);

  // Una respuesta vacia casi siempre es un error disfrazado. Sobrescribir la
  // hoja con nada dejaria el tablero en ceros sin avisar, que es justo la
  // falla silenciosa que queremos evitar.
  if (!filas.length) {
    throw new Error('BigQuery devolvio cero filas — no se toca la hoja.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = NOMBRE_HOJA ? ss.getSheetByName(NOMBRE_HOJA) : ss.getSheets()[0];
  if (!hoja) throw new Error('No encontre la pestaña destino.');

  var datos = [['fecha', 'registros', 'calificados', 'asignados', 'citas', 'cierres']].concat(filas);

  // Limpiar solo lo que sobra, para no dejar filas viejas colgando abajo.
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila > datos.length) {
    hoja.getRange(datos.length + 1, 1, ultimaFila - datos.length, hoja.getLastColumn()).clearContent();
  }
  hoja.getRange(1, 1, datos.length, 6).setValues(datos);

  Logger.log('Actualizadas ' + filas.length + ' filas.');
}


function consultarBigQuery_(sql) {
  var req = { query: sql, useLegacySql: false, timeoutMs: 60000 };
  var res = BigQuery.Jobs.query(req, PROJECT_ID);
  var jobId = res.jobReference.jobId;
  var location = res.jobReference.location;

  // El primer query puede volver antes de terminar. Hay que esperarlo.
  var esperas = 0;
  while (!res.jobComplete && esperas < 20) {
    Utilities.sleep(3000);
    res = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, { location: location });
    esperas++;
  }
  if (!res.jobComplete) throw new Error('El job de BigQuery no termino a tiempo.');

  var filas = [];
  var pageToken = null;
  do {
    if (pageToken) {
      res = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, { location: location, pageToken: pageToken });
    }
    (res.rows || []).forEach(function (r) {
      filas.push(r.f.map(function (c, i) {
        // fecha como texto; el resto como numero, para que la hoja no los
        // guarde como cadenas y el tablero los tenga que reparar.
        return i === 0 ? c.v : Number(c.v);
      }));
    });
    pageToken = res.pageToken;
  } while (pageToken);

  return filas;
}


function instalarDisparador() {
  // Borra disparadores previos de esta funcion para no acumular duplicados.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualizarLeads') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarLeads').timeBased().everyHours(3).create();
  Logger.log('Disparador instalado: cada 3 horas.');
}


/**
 * Opcional pero recomendado: avisa por correo si la actualizacion falla.
 * Instalalo con `instalarDisparador` ya corriendo; Apps Script manda el aviso
 * de fallo automaticamente al dueño del script una vez al dia, pero esto lo
 * hace inmediato.
 */
function actualizarLeadsConAviso() {
  try {
    actualizarLeads();
  } catch (e) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'Falló la actualización del tablero ChatGPT Ads MX',
      'La hoja de leads no se pudo actualizar desde BigQuery.\n\n' +
      'Error: ' + e.message + '\n\n' +
      'El tablero va a seguir mostrando los últimos datos buenos, con la fecha ' +
      'de frescura desactualizada arriba a la izquierda.'
    );
    throw e;
  }
}
