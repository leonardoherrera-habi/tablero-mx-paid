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

// Leads de prueba que NO deben contar en el tablero.
//
// Dos capas a proposito:
//   1. Lista explicita de nid para las pruebas ya hechas. Es precisa y queda
//      auditable: se ve cual se excluyo y por que.
//   2. Regla por dominio @prueba, como red secundaria.
//
// OJO: la regla del correo NO es confiable por si sola. Verificado el
// 15-sep-2026: la columna `correo` llega hasheada en algunos leads (44
// caracteres, sin arroba) y en texto plano en otros. Una prueba hecha con
// mariano@prueba paso de largo porque su correo llego hasheado. La lista de
// nid es la que manda; el correo solo atrapa lo que ya venia en claro.
//
// Para excluir una prueba nueva: agrega su nid aqui con un comentario de la
// fecha. Se encuentra corriendo, en BigQuery:
//   SELECT nid, DATE(fecha_creacion) FROM tabla_inmuebles_general
//   WHERE LOWER(campana_mercadeo) LIKE '%hatgpt%' ORDER BY fecha_creacion DESC
//
// A proposito NO se filtra por palabras sueltas como "test" o "demo" dentro
// del correo: un lead real que las contenga desapareceria del tablero sin que
// nadie lo note, y perder uno real es peor que dejar pasar uno de prueba.
var NID_PRUEBA = [
  '64820539031',  // 2026-09-08, prueba manual con la URL armada a mano
  '65059419528'   // 2026-09-15, prueba a nombre de Mariano
];

var SQL =
  "WITH dias AS (\n" +
  "  SELECT d FROM UNNEST(GENERATE_DATE_ARRAY(DATE '" + INICIO + "', CURRENT_DATE('America/Mexico_City'))) AS d\n" +
  "),\n" +
  // Cada etapa se cuenta el dia en que ocurrio, como el WBR y el tablero MX
  // Paid (acordado el 26-oct-2026). Antes todo iba por dia de creacion del lead.
  // Calificado = llego a pricing (fecha_a_pricing), como Marketing NEW de Camilo
  // (29-oct-2026). fecha_primer_calificacion contaba ~40% mas.
  "cierres AS (\n" +
  "  SELECT nid, MIN(DATE(fecha)) AS d\n" +
  "  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`\n" +
  "  WHERE valor = 'Cierre - Comprado'\n" +
  "  GROUP BY nid\n" +
  "),\n" +
  "asignados AS (\n" +
  "  SELECT nid, MIN(CAST(dia AS DATE)) AS d\n" +
  "  FROM `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart`\n" +
  "  WHERE pais = 'mexico'\n" +
  "  GROUP BY nid\n" +
  "),\n" +
  "eventos AS (\n" +
  "  SELECT e.etapa, e.d\n" +
  "  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` g\n" +
  "  LEFT JOIN asignados asi ON g.nid = asi.nid\n" +
  "  LEFT JOIN cierres c ON g.nid = c.nid,\n" +
  "  UNNEST([\n" +
  "    STRUCT('reg' AS etapa, DATE(g.fecha_creacion) AS d),\n" +
  "    ('cal', DATE(g.fecha_a_pricing)), ('asg', asi.d),\n" +
  "    ('cit', DATE(g.fecha_cita_agendada)), ('cie', c.d)]) AS e\n" +
  // Sin JOIN al diccionario UTM a proposito: es una tabla externa sobre Sheets
  // y la organizacion bloquea el scope de Drive para cuentas de servicio.
  // Es una sola campaña, asi que el LIKE basta y elimina esa dependencia.
  "  WHERE LOWER(COALESCE(g.campana_mercadeo,'')) LIKE '%hatgpt%'\n" +
  // Lo organico de ChatGPT llega como utm_source 'chatgpt.com' (con el punto
  // com) y SIN campaña, asi que el LIKE de arriba ya lo deja fuera. Esto es el
  // segundo cerrojo: tendria que fallar en dos lugares a la vez para colarse.
  // Se EXCLUYE lo organico en vez de EXIGIR utm_source='chatgpt' a proposito:
  // exigirlo tiraria en silencio cualquier lead pagado que llegara sin fuente.
  "    AND LOWER(COALESCE(g.utm_source,'')) <> 'chatgpt.com'\n" +
  "    AND LOWER(COALESCE(g.correo,'')) NOT LIKE '%@prueba%'\n" +
  // CAST porque nid es INT64 y la lista son cadenas.
  (NID_PRUEBA.length
     ? "    AND CAST(g.nid AS STRING) NOT IN ('" + NID_PRUEBA.join("','") + "')\n"
     : "") +
  "    AND e.d IS NOT NULL\n" +
  "),\n" +
  "leads AS (\n" +
  "  SELECT d AS dia,\n" +
  "    COUNTIF(etapa = 'reg') AS registros, COUNTIF(etapa = 'cal') AS calificados,\n" +
  "    COUNTIF(etapa = 'asg') AS asignados, COUNTIF(etapa = 'cit') AS citas,\n" +
  "    COUNTIF(etapa = 'cie') AS cierres\n" +
  "  FROM eventos\n" +
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
