/**
 * Llena la hoja del tablero MX Paid Media desde BigQuery, sola, en servidores
 * de Google. Reemplaza al GitHub Action (que copiaba un data.json de Drive que
 * nadie volvio a generar desde el 13-jun-2026) y a refresh.js (que dependia de
 * la laptop y de una sesion que expira).
 *
 * POR QUE ESTE DISEÑO
 * -------------------
 * La logica es la de query.sql (alineada con el tablero de Camilo Otoya, llave
 * mkt_channel_big). La diferencia es de donde sale el diccionario UTM:
 * query.sql lo cruza como tabla externa sobre Sheets
 * (`sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`), y ese cruce falla
 * en cualquier proceso automatico porque la organizacion bloquea el scope de
 * Drive. Aqui el script lee la hoja del diccionario directo con
 * SpreadsheetApp y se la pasa a BigQuery como parametro JSON. BigQuery nunca
 * toca Drive.
 *
 * INSTALACION (una sola vez, ~10 minutos)
 * --------------------------------------
 * 1. Crea una hoja de Google nueva, vacia ("Tablero MX Paid - datos").
 * 2. Extensiones -> Apps Script. Pega este archivo completo.
 * 3. Panel izquierdo: Servicios (+) -> BigQuery API -> Agregar.
 * 4. Corre `actualizarTablero` a mano. Autoriza con leonardoherrera@tuhabi.mx.
 *    Al terminar, el registro (Ejecuciones) imprime el ID de la hoja y los
 *    gid de las pestañas `data` y `meta`. Esos tres valores van en index.html.
 * 5. Comparte la hoja como "Cualquier persona con el enlace: Lector". Es lo
 *    que permite que el HTML la lea por CSV. Los mismos datos ya eran publicos
 *    como data.json en GitHub Pages, asi que la exposicion no cambia.
 * 6. Corre `instalarDisparador`. Agenda la corrida cada 3 horas.
 *
 * Para verificar despues: Apps Script -> Ejecuciones.
 */

var PROJECT_ID = 'papyrus-data-mx';

// Hoja "Tablero MX Paid - datos", la que lee index.html.
var TABLERO_SHEET_ID = '18y7MAizfvsO7Pwy7SlBSBmSY1BHCoRpwYmoHMzUQKSs';

// Diccionario UTM de Mexico. Es la misma hoja que respalda la tabla externa
// registro_unico_utm_mkt_mexico (pestaña MX).
var DICT_SHEET_ID = '1sBg4hIBzWDTfZhORtr-HtVIfxvnILmJqCqfzuk1Jpxk';
var DICT_TAB = 'MX';

// Ventana movil. ~13 meses, igual que el data.json anterior; evita que la hoja
// crezca sin limite.
var DIAS_HISTORIA = 400;

var COLUMNAS = ['fecha', 'segmento', 'sub_canal', 'plataforma', 'campana', 'medio',
                'creados', 'calificados', 'asignados', 'cita_agendada', 'cierres',
                'inversion', 'impressions', 'clicks'];
var N_TEXTO = 6;  // las primeras 6 columnas son texto; el resto, numeros

// Planning 2026 Oficial de Camilo Otoya. De ahi salen las metas de asignados
// ("MX Fuentes"), las de inversion ("MX Inversion") y el tipo de cambio diario
// ("TRM"), para que el tablero las tome solas si Camilo las ajusta.
var PLANNING_SHEET_ID = '1lBAh2SUOkx5XD5UD20KvQglNzwLJkjWlqkvp2Qw5FgY';
// Secciones del Planning que usa el tablero. Las de ciclos y las diarias se
// dejan fuera a proposito, para no cargar el informe.
var SECCIONES_META = { 'Anuales': 'anual', 'Trimestrales': 'trimestral',
                       'Mensuales': 'mensual', 'Semanales': 'semanal' };

// Corte en fecha de Mexico, no UTC: corriendo de noche, UTC ya seria mañana y
// colaria el dia en curso, que viene incompleto.
var HOY = "CURRENT_DATE('America/Mexico_City')";
var DESDE = "DATE_SUB(" + HOY + ", INTERVAL " + DIAS_HISTORIA + " DAY)";

var SQL = [
  // Diccionario recibido como JSON desde la hoja. NULLIF('') replica como la
  // tabla externa lee las celdas vacias (NULL).
  "WITH dict_raw AS (",
  "  SELECT",
  "    NULLIF(JSON_VALUE(x, '$.utm'), '') AS utm,",
  "    NULLIF(JSON_VALUE(x, '$.cmp'), '') AS cmp,",
  "    NULLIF(JSON_VALUE(x, '$.big'), '') AS big,",
  "    NULLIF(JSON_VALUE(x, '$.med'), '') AS med,",
  "    NULLIF(JSON_VALUE(x, '$.pl'),  '') AS pl,",
  "    NULLIF(JSON_VALUE(x, '$.media'), '') AS media",
  "  FROM UNNEST(JSON_QUERY_ARRAY(@dict)) AS x",
  "),",
  "",
  // SEGMENTOS (los bloques del tablero, como "MX Mes Actual" de Marketing NEW):
  // Brand y Marketing Loop van aparte (decision de Leonardo, 26-oct-2026):
  // Brand no busca generar leads y su inversion inflaba WEB Paid; Loop son
  // leads viejos reactivados, no adquisicion paid.
  //
  // 1. Campaña paid -> segmento de inversion (match por mkt_campaign_name). Si
  // no esta en el diccionario, el mismo respaldo que "MX Query $" del Planning:
  // canal_adquisicion y despues el nombre de la campaña.
  "cmp_to_class AS (",
  "  SELECT cmp,",
  "    ANY_VALUE(CASE big WHEN 'WEB' THEN 'WEB Paid' WHEN 'Brand' THEN 'Brand'",
  "      WHEN 'Estudio Inmueble' THEN 'Habímetro Paid' WHEN 'Lead Forms' THEN 'Lead Forms'",
  "      WHEN 'Propiedades' THEN 'Propiedades' END) AS seg,",
  "    ANY_VALUE(med) AS sub",
  "  FROM dict_raw WHERE cmp IS NOT NULL GROUP BY cmp",
  "),",
  "",
  // 2. Inversion. Todas las plataformas de la tabla (todas en USD; ChatGPT ya
  // entra convertido).
  "spend_agg AS (",
  "  SELECT i.date AS d, i.plataforma AS pl,",
  "    COALESCE(NULLIF(i.campana_original, ''), NULLIF(i.campana, ''), '(sin campaña)') AS cmp,",
  "    CASE",
  "      WHEN LOWER(i.campana_original) LIKE '%reinteresados%' THEN 'Marketing Loop'",
  "      WHEN c.seg IS NOT NULL THEN c.seg",
  "      WHEN i.canal_adquisicion = 'Habimetro' THEN 'Habímetro Paid'",
  "      WHEN i.canal_adquisicion = 'Lead Form' THEN 'Lead Forms'",
  "      WHEN i.canal_adquisicion = 'Web' THEN 'WEB Paid'",
  "      WHEN REGEXP_CONTAINS(LOWER(i.campana_original), r'habimetro|hmt|(^|[_-])hm([_-]|$)') THEN 'Habímetro Paid'",
  "      WHEN REGEXP_CONTAINS(LOWER(i.campana_original), r'lead ?ads|lead ?form|lfr') THEN 'Lead Forms'",
  "      WHEN REGEXP_CONTAINS(LOWER(i.campana_original), r'habiweb|_sem_|performance_max|conversion|youtube|^tuh-mex-sel-') THEN 'WEB Paid'",
  "      ELSE 'Otros'",
  "    END AS seg,",
  "    COALESCE(NULLIF(c.sub, ''), 'Sin sub-fuente') AS sub,",
  "    'Paid' AS medio,",
  "    SUM(i.impressions) AS imp, SUM(i.clicks) AS clk, SUM(i.spend) AS spend",
  "  FROM `papyrus-data-mx.habi_wh_bi.resumen_inversiones_mkt_mx` i",
  "  LEFT JOIN cmp_to_class c ON c.cmp = i.campana_original",
  "  WHERE i.date >= " + DESDE + " AND i.date < " + HOY,
  "  GROUP BY d, pl, cmp, seg, sub, medio",
  "),",
  "",
  // 3. Diccionario para enriquecer leads (match por campana_mercadeo_original).
  "dict AS (",
  "  SELECT utm, ANY_VALUE(pl) AS pl, ANY_VALUE(cmp) AS cmp,",
  "    ANY_VALUE(big) AS channel_big, ANY_VALUE(med) AS channel_medium,",
  "    ANY_VALUE(media) AS media",
  "  FROM dict_raw WHERE utm IS NOT NULL GROUP BY utm",
  "),",
  "",
  // Marketing Loop con la misma regla que "MX Query Leads" del Planning.
  "loop_nids AS (",
  "  SELECT DISTINCT SAFE_CAST(nid AS INT64) AS nid",
  "  FROM `sellers-main-prod.hubspot.deals`",
  "  WHERE country = 'México' AND utm_campaign LIKE '%reinteresados%'",
  "),",
  "",
  // Cada etapa se cuenta el dia en que ocurrio, como el WBR y el Planning de
  // Camilo (acordado con Leonardo el 26-oct-2026). Antes todo iba por cohorte
  // de creacion y las semanas recientes se veian casi sin cierres: el lead
  // tarda ~49 dias de mediana de calificar a cerrar.
  //
  // Fuentes oficiales, no las fechas de la TIG:
  //  - asignados: WBR mart. fecha_primer_asignacion de la TIG cuenta cualquier
  //    asignacion y en WEB inflaba ~50% (1-20 oct 2026: 2,244 contra 1,462).
  //  - cierres: seguimiento_funnel_mex 'Cierre - Comprado'. fecha_cierre de la
  //    TIG trae de mas (WEB, semana del 19-oct: 33 contra 23).
  "asignados_wbr AS (",
  "  SELECT nid, MIN(CAST(dia AS DATE)) AS d",
  "  FROM `papyrus-master.sellers_data_mart.sellers_leads_asignados_marketing_wbr_mart`",
  "  WHERE pais = 'mexico'",
  "  GROUP BY nid",
  "),",
  "",
  "cierres AS (",
  "  SELECT nid, MIN(DATE(fecha)) AS d",
  "  FROM `sellers-main-prod.bi_mx.seguimiento_funnel_mex`",
  "  WHERE valor = 'Cierre - Comprado'",
  "  GROUP BY nid",
  "),",
  "",
  // 4. Clasificacion del lead en su segmento. Misma reasignacion de fuente que
  // query.sql (llave mkt_channel_big del diccionario) y la regla de Paid del
  // Planning: mkt_media = 'Paid' o mkt_channel_medium termina en " Paid". Sin
  // filtro de fecha de creacion: un lead viejo puede cerrar dentro de la ventana.
  "leads AS (",
  "  SELECT t.nid,",
  "    DATE(t.fecha_creacion) AS d_cre,",
  "    DATE(t.fecha_primer_calificacion) AS d_cal,",
  "    m.d AS d_asg,",
  "    DATE(t.fecha_cita_agendada) AS d_cit,",
  "    c.d AS d_cie,",
  "    CASE",
  "      WHEN lp.nid IS NOT NULL THEN 'Marketing Loop'",
  "      WHEN d.channel_big = 'Brand' THEN 'Brand'",
  "      WHEN d.channel_big = 'Propiedades' THEN 'Propiedades'",
  "      WHEN f.fid = 3  THEN IF(f.es_paid, 'WEB Paid', 'WEB Direct')",
  "      WHEN f.fid = 7  THEN IF(f.es_paid, 'Habímetro Paid', 'Habímetro Direct')",
  "      WHEN f.fid = 47 THEN 'Lead Forms'",
  "      WHEN f.fid = 39 THEN 'Brokers'",
  "      WHEN f.fid = 35 THEN 'Comercial'",
  "      WHEN f.fid = 46 THEN 'Propiedades'",
  "      ELSE 'Otros'",
  "    END AS seg,",
  // Lead Forms es paid por definicion (como "Leadforms Paid" del Planning),
  // aunque el lead no traiga campaña.
  "    IF(f.es_paid OR f.fid = 47 OR d.channel_big = 'Brand', 'Paid', 'Orgánico') AS medio,",
  "    d.pl AS pl,",
  "    COALESCE(d.cmp, '(sin campaña)') AS cmp,",
  "    CASE",
  "      WHEN t.campana_mercadeo IS NULL OR t.campana_mercadeo IN ('', 'xxxxx') THEN",
  "        CASE t.fuente_id WHEN 47 THEN 'Lead Forms Paid' WHEN 3 THEN 'WEB Direct'",
  "                         WHEN 7 THEN 'Estudio Inmueble Direct' ELSE 'Otros' END",
  "      WHEN d.channel_medium IS NULL OR d.channel_medium = '' THEN t.campana_mercadeo",
  "      ELSE d.channel_medium",
  "    END AS sub",
  "  FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` t",
  "  LEFT JOIN dict d ON d.utm = t.campana_mercadeo",
  "  LEFT JOIN asignados_wbr m ON m.nid = t.nid",
  "  LEFT JOIN cierres c ON c.nid = t.nid",
  "  LEFT JOIN loop_nids lp ON lp.nid = t.nid",
  "  CROSS JOIN UNNEST([STRUCT(",
  "    CASE",
  "      WHEN t.campana_mercadeo IS NULL OR t.campana_mercadeo IN ('', 'xxxxx') THEN t.fuente_id",
  "      WHEN d.channel_big = 'WEB' THEN 3",
  "      WHEN d.channel_big = 'Estudio Inmueble' THEN 7",
  "      WHEN d.channel_big = 'Lead Forms' THEN 47",
  "      ELSE t.fuente_id",
  "    END AS fid,",
  "    COALESCE(d.media = 'Paid' OR d.channel_medium LIKE '% Paid', FALSE) AS es_paid",
  "  )]) AS f",
  "  WHERE t.fecha_creacion IS NOT NULL",
  // Las mismas fuentes que suma el TOTAL de "MX Fuentes" del Planning: WEB,
  // Habimetro, Lead Forms, Comercial, Brokers y Propiedades.
  "    AND t.fuente_id IN (3, 7, 47, 35, 39, 46)",
  "    AND t.nid IS NOT NULL",
  // La TIG deberia traer un nid por fila; esto evita contar doble si no.
  "  QUALIFY ROW_NUMBER() OVER (PARTITION BY t.nid) = 1",
  "),",
  "",
  // 5. Un evento por etapa, cada uno en su propia fecha.
  "eventos AS (",
  "  SELECT seg, medio, pl, cmp, sub, e.etapa, e.d",
  "  FROM leads, UNNEST([",
  "    STRUCT('cre' AS etapa, d_cre AS d), ('cal', d_cal), ('asg', d_asg),",
  "    ('cit', d_cit), ('cie', d_cie)]) AS e",
  "  WHERE e.d >= " + DESDE + " AND e.d < " + HOY,
  "),",
  "",
  "funnel_agg AS (",
  "  SELECT d, seg, medio, pl, cmp, sub,",
  "    COUNTIF(etapa = 'cre') AS cre, COUNTIF(etapa = 'cal') AS cal,",
  "    COUNTIF(etapa = 'asg') AS asg, COUNTIF(etapa = 'cit') AS cit,",
  "    COUNTIF(etapa = 'cie') AS cie",
  "  FROM eventos",
  "  GROUP BY d, seg, medio, pl, cmp, sub",
  "),",
  "",
  "unido AS (",
  "  SELECT d, seg, medio, pl, cmp, sub, imp, clk, spend, 0 AS cre, 0 AS cal, 0 AS asg, 0 AS cit, 0 AS cie FROM spend_agg",
  "  UNION ALL",
  "  SELECT d, seg, medio, pl, cmp, sub, 0, 0, 0.0, cre, cal, asg, cit, cie FROM funnel_agg",
  ")",
  "",
  // 6. Salida con la forma que espera index.html (ver COLUMNAS). Una fila por
  // llave: inversion y funnel de la misma campaña y dia quedan juntos.
  "SELECT",
  "  FORMAT_DATE('%Y-%m-%d', d) AS fecha,",
  "  seg AS segmento,",
  "  sub AS sub_canal,",
  // Normaliza mayusculas: el diccionario y la tabla de inversion escriben
  // distinto la misma plataforma (google / Google).
  "  CASE LOWER(IFNULL(pl, ''))",
  "    WHEN '' THEN 'Sin plataforma' WHEN 'google' THEN 'Google' WHEN 'facebook' THEN 'Facebook'",
  "    WHEN 'bing' THEN 'Bing' WHEN 'tiktok' THEN 'TikTok' WHEN 'chatgpt' THEN 'ChatGPT'",
  "    ELSE pl END AS plataforma,",
  "  cmp AS campana,",
  "  medio,",
  "  SUM(cre) AS creados, SUM(cal) AS calificados, SUM(asg) AS asignados,",
  "  SUM(cit) AS cita_agendada, SUM(cie) AS cierres,",
  "  ROUND(SUM(IFNULL(spend, 0)), 2) AS inversion,",
  "  CAST(SUM(IFNULL(imp, 0)) AS INT64) AS impressions,",
  "  CAST(SUM(IFNULL(clk, 0)) AS INT64) AS clicks",
  "FROM unido",
  "GROUP BY 1, 2, 3, 4, 5, 6",
  "ORDER BY 1, 2, 3, 4, 5, 6"
].join('\n');


function actualizarTablero() {
  var dict = leerDiccionario_();
  var filas = consultarBigQuery_(SQL, dict);

  // Una respuesta vacia casi siempre es un error disfrazado. Sobrescribir la
  // hoja con nada dejaria el tablero en ceros sin avisar.
  if (filas.length < 1000) {
    throw new Error('BigQuery devolvio solo ' + filas.length + ' filas — no se toca la hoja.');
  }

  // Por ID y no getActiveSpreadsheet(): el 26-oct-2026 una corrida fallo con
  // "No se encontro la hoja 1086648177", un gid que no existe en esta hoja.
  // Abrirla por ID no depende de a que archivo quedo pegado el script.
  var ss = SpreadsheetApp.openById(TABLERO_SHEET_ID);
  // Con configuracion regional de Mexico la hoja exporta "0,86" en el CSV y el
  // tablero leeria 0. En_US exporta 0.86. (index.html tambien tolera la coma.)
  if (ss.getSpreadsheetLocale() !== 'en_US') ss.setSpreadsheetLocale('en_US');
  var hoja = obtenerPestana_(ss, 'data');
  var datos = [COLUMNAS].concat(filas);

  // Escribe por bloques para no topar los limites de una sola llamada.
  var BLOQUE = 10000;
  for (var i = 0; i < datos.length; i += BLOQUE) {
    var parte = datos.slice(i, i + BLOQUE);
    hoja.getRange(i + 1, 1, parte.length, COLUMNAS.length).setValues(parte);
  }
  // Limpia lo que sobre de una corrida anterior mas larga.
  var ultima = hoja.getLastRow();
  if (ultima > datos.length) {
    hoja.getRange(datos.length + 1, 1, ultima - datos.length, COLUMNAS.length).clearContent();
  }

  // Metas y tipo de cambio. Si el Planning falla, el tablero sigue con los datos
  // y sin metas: no vale la pena dejarlo sin actualizar por eso.
  var gidMetas = '', gidTc = '', avisoPlanning = '';
  try {
    var planning = SpreadsheetApp.openById(PLANNING_SHEET_ID);
    gidMetas = escribirTabla_(ss, 'metas',
      [['tipo', 'desde', 'hasta', 'segmento', 'meta_asignados', 'meta_inversion_mxn']].concat(leerMetas_(planning)));
    gidTc = escribirTabla_(ss, 'tc', [['mes', 'tasa']].concat(leerTipoCambio_(planning)));
  } catch (e) {
    avisoPlanning = e.message;
    Logger.log('No se pudieron leer metas o tipo de cambio del Planning: ' + e.message);
  }

  var fechas = filas.map(function (f) { return f[0]; });
  var meta = obtenerPestana_(ss, 'meta');
  meta.clearContents();
  meta.getRange(1, 1, 8, 2).setValues([
    ['generado_utc', new Date().toISOString()],
    ['registros', filas.length],
    ['desde', fechas[0]],
    ['hasta', fechas[fechas.length - 1]],
    ['filas_diccionario', dict.length],
    // index.html lee aqui los gid de las pestañas nuevas, para no tener que
    // copiarlos a mano cuando el script las crea.
    ['gid_metas', gidMetas],
    ['gid_tc', gidTc],
    ['aviso_planning', avisoPlanning]
  ]);

  Logger.log('Actualizadas ' + filas.length + ' filas (' + fechas[0] + ' a ' + fechas[fechas.length - 1] + ').');
  Logger.log('SHEET_ID: ' + ss.getId() + ' | gid data: ' + hoja.getSheetId() + ' | gid meta: ' + meta.getSheetId());
}


function leerDiccionario_() {
  var libro = SpreadsheetApp.openById(DICT_SHEET_ID);
  var hoja = libro.getSheetByName(DICT_TAB) || libro.getSheets()[0];
  var valores = hoja.getDataRange().getDisplayValues();
  var enc = valores[0].map(function (h) { return String(h).trim(); });

  // Busca columnas por nombre, no por posicion: si alguien inserta una columna
  // en la hoja, el tablero no se descompone en silencio.
  function col(prefijo) {
    for (var i = 0; i < enc.length; i++) if (enc[i].indexOf(prefijo) === 0) return i;
    throw new Error('El diccionario no tiene la columna ' + prefijo + '. Encabezados: ' + enc.join(' | '));
  }
  var cUtm = col('campana_mercadeo_original');
  var cCmp = col('mkt_campaign_name');
  var cBig = col('mkt_channel_big');
  var cMed = col('mkt_channel_medium');
  var cPl  = col('mkt_platform');
  var cMedia = col('mkt_media');

  var dict = [];
  for (var r = 1; r < valores.length; r++) {
    var v = valores[r];
    if (!v[cUtm] && !v[cCmp]) continue;
    dict.push({ utm: v[cUtm], cmp: v[cCmp], big: v[cBig], med: v[cMed], pl: v[cPl], media: v[cMedia] });
  }
  if (dict.length < 50) throw new Error('El diccionario trae solo ' + dict.length + ' filas; algo esta mal.');
  return dict;
}


function consultarBigQuery_(sql, dict) {
  var req = {
    query: sql,
    useLegacySql: false,
    timeoutMs: 120000,
    parameterMode: 'NAMED',
    queryParameters: [{
      name: 'dict',
      parameterType: { type: 'STRING' },
      parameterValue: { value: JSON.stringify(dict) }
    }]
  };
  var res = BigQuery.Jobs.query(req, PROJECT_ID);
  var jobId = res.jobReference.jobId;
  var location = res.jobReference.location;

  var esperas = 0;
  while (!res.jobComplete && esperas < 40) {
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
      // Las primeras N_TEXTO columnas son texto; el resto numeros (asi la hoja
      // no las guarda como cadenas).
      filas.push(r.f.map(function (c, i) {
        if (i < N_TEXTO) return c.v === null ? '' : c.v;
        return c.v === null ? 0 : Number(c.v);
      }));
    });
    pageToken = res.pageToken;
  } while (pageToken);

  return filas;
}


// Metas del Planning en filas planas: tipo, desde, hasta, segmento, meta de
// asignados ("MX Fuentes") y meta de inversion ("MX Inversion", que viene en
// MILES de MXN; aqui se guarda en MXN).
//
// Las dos pestañas tienen la misma forma: fila 1 con el segmento sobre cada
// bloque de 7 columnas, fila 2 con "Meta", "Meta a la fecha"..., y en la
// columna A los nombres de seccion (Anuales, Trimestrales, Mensuales...).
function leerMetas_(planning) {
  var tz = planning.getSpreadsheetTimeZone();
  var metas = {};
  [['MX Fuentes', 'asg'], ['MX Inversion', 'inv']].forEach(function (par) {
    var hoja = planning.getSheetByName(par[0]);
    if (!hoja) throw new Error('El Planning no tiene la pestaña ' + par[0]);
    var v = hoja.getDataRange().getValues();
    var columnas = [];
    for (var j = 0; j < v[1].length; j++) {
      var seg = String(v[0][j] || '').trim();
      if (seg && String(v[1][j]).trim() === 'Meta') columnas.push([j, seg]);
    }
    if (!columnas.length) throw new Error(par[0] + ' no trae columnas "Meta"; cambio su formato.');
    var seccion = null;
    for (var r = 2; r < v.length; r++) {
      var a = String(v[r][0] || '').trim();
      if (a && isNaN(Number(a))) { seccion = SECCIONES_META[a] || null; continue; }
      if (!seccion || !(v[r][2] instanceof Date) || !(v[r][4] instanceof Date)) continue;
      var desde = Utilities.formatDate(v[r][2], tz, 'yyyy-MM-dd');
      var hasta = Utilities.formatDate(v[r][4], tz, 'yyyy-MM-dd');
      columnas.forEach(function (c) {
        var valor = Number(v[r][c[0]]);
        if (!valor) return;
        var k = [seccion, desde, hasta, c[1]].join('|');
        metas[k] = metas[k] || { asg: '', inv: '' };
        metas[k][par[1]] = par[1] === 'inv' ? Math.round(valor * 1000) : Math.round(valor);
      });
    }
  });
  var filas = Object.keys(metas).sort().map(function (k) {
    return k.split('|').concat([metas[k].asg, metas[k].inv]);
  });
  if (filas.length < 20) throw new Error('El Planning trae solo ' + filas.length + ' metas; algo cambio.');
  return filas;
}


// Promedio mensual del tipo de cambio diario de la pestaña "TRM" (columnas D y
// E: fecha y cierre MXN por USD). Sirve para los meses sin tasa definida en
// index.html (todo 2025).
function leerTipoCambio_(planning) {
  var hoja = planning.getSheetByName('TRM');
  if (!hoja) throw new Error('El Planning no tiene la pestaña TRM');
  var tz = planning.getSpreadsheetTimeZone();
  var v = hoja.getDataRange().getValues();
  var meses = {};
  for (var r = 1; r < v.length; r++) {
    var f = v[r][3], t = Number(v[r][4]);
    if (!(f instanceof Date) || !t) continue;
    var m = Utilities.formatDate(f, tz, 'yyyy-MM');
    meses[m] = meses[m] || [0, 0];
    meses[m][0] += t; meses[m][1]++;
  }
  return Object.keys(meses).sort().map(function (m) {
    return [m, Math.round(meses[m][0] / meses[m][1] * 10000) / 10000];
  });
}


// Escribe una tabla chica en su pestaña y devuelve el gid. Formato de texto
// plano: si no, la hoja convierte "2026-10-01" en fecha y el CSV la exporta
// como 10/1/2026.
function escribirTabla_(ss, nombre, datos) {
  var hoja = obtenerPestana_(ss, nombre);
  hoja.clearContents();
  var rango = hoja.getRange(1, 1, datos.length, datos[0].length);
  rango.setNumberFormat('@');
  rango.setValues(datos.map(function (f) { return f.map(String); }));
  return String(hoja.getSheetId());
}


function obtenerPestana_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (hoja) return hoja;
  // En una hoja nueva, la primera pestaña se renombra a `data` (conserva gid 0).
  if (nombre === 'data' && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0) {
    return ss.getSheets()[0].setName('data');
  }
  return ss.insertSheet(nombre);
}


function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'actualizarTablero' || f === 'actualizarTableroConAviso') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarTableroConAviso').timeBased().everyHours(3).create();
  Logger.log('Disparador instalado: cada 3 horas.');
}


function actualizarTableroConAviso() {
  try {
    actualizarTablero();
  } catch (e) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'Falló la actualización del tablero MX Paid Media',
      'La hoja del tablero no se pudo actualizar desde BigQuery.\n\n' +
      'Error: ' + e.message + '\n\n' +
      'El tablero va a seguir mostrando los últimos datos buenos, con la fecha ' +
      'de actualización desactualizada arriba.'
    );
    throw e;
  }
}
