/**
 * Llena la hoja "Gasto ChatGPT Ads MX" desde la API de anuncios de OpenAI.
 * Corre en servidores de Google. Cierra el ultimo paso manual del tablero.
 *
 * OJO ANTES DE CONFIAR EN ESTO
 * ----------------------------
 * La forma del request esta tomada de la documentacion oficial
 * (developers.openai.com/ads), pero NO se ha ejecutado una llamada real
 * todavia. La primera corrida es la verificacion: si la respuesta no trae
 * lo esperado, el script aborta y deja el cuerpo crudo en el registro para
 * poder ajustarlo. No sobrescribe la hoja con datos dudosos.
 *
 * INSTALACION
 * -----------
 * 1. Consigue la API key de anuncios. Esta en beta y es "account-gated":
 *    puede estar en la configuracion del Ads Manager o hay que pedirla.
 *    Cada key esta amarrada a UNA cuenta publicitaria, asi que no hace
 *    falta pasar el id de la cuenta en ningun lado.
 *
 * 2. Abre la hoja de Gasto -> Extensiones -> Apps Script.
 *
 * 3. Pega este archivo.
 *
 * 4. Guarda la key SIN escribirla en el codigo:
 *    Configuracion del proyecto (el engrane) -> Propiedades de la secuencia
 *    de comandos -> Agregar propiedad
 *        Propiedad: OPENAI_ADS_API_KEY
 *        Valor:     (tu key)
 *    Asi no queda en el repositorio ni la ve nadie mas.
 *
 * 5. Corre `probarConexion` primero. Solo consulta y escribe en el registro;
 *    no toca la hoja. Si ves las filas, vas bien.
 *
 * 6. Corre `actualizarGasto`. Revisa la hoja.
 *
 * 7. Corre `instalarDisparadorGasto`. Queda agendado cada 3 horas.
 */

var BASE = 'https://api.ads.openai.com/v1';
var CAMPANA = 'Tuhabi_Chatgpt_Conversiones_MX_Nacional';
var INICIO = '2026-09-07';
var TZ = 'America/Mexico_City';
var NOMBRE_HOJA_GASTO = null;   // null = primera pestaña


function probarConexion() {
  var filas = traerInsights_();
  Logger.log('Filas recibidas: ' + filas.length);
  filas.slice(0, 10).forEach(function (f) { Logger.log(JSON.stringify(f)); });
  return filas.length;
}


function actualizarGasto() {
  var filas = traerInsights_();

  // Mismo criterio que en el script de leads: una respuesta vacia casi siempre
  // es un error disfrazado, y vaciar la hoja dejaria el tablero en ceros sin
  // avisar. Preferimos datos viejos y visiblemente viejos.
  if (!filas.length) {
    throw new Error('La API no devolvio filas — no se toca la hoja.');
  }

  var porDia = {};
  filas.forEach(function (f) {
    var nombre = f.campaign_name || '';
    // La key esta amarrada a una cuenta, pero si algun dia hay mas campañas
    // en esa cuenta no queremos sumarlas aqui.
    if (CAMPANA && nombre && nombre !== CAMPANA) return;

    var dia = fechaDe_(f);
    if (!dia) return;
    if (!porDia[dia]) porDia[dia] = { spend: 0, clicks: 0, impressions: 0, conv: 0 };
    porDia[dia].spend      += Number(f.spend || 0);
    porDia[dia].clicks     += Number(f.clicks || 0);
    porDia[dia].impressions += Number(f.impressions || 0);
    porDia[dia].conv       += Number(f.conversions || f.click_through_conversions || 0);
  });

  var dias = Object.keys(porDia).sort();
  if (!dias.length) {
    throw new Error('Llegaron ' + filas.length + ' filas pero ninguna de la campaña "' +
                    CAMPANA + '" con fecha legible. Revisa el registro de probarConexion.');
  }

  var datos = [['fecha', 'spend_mxn', 'clicks', 'impressions', 'conversiones_plataforma', 'tipo_cambio']];
  dias.forEach(function (d) {
    var r = porDia[d];
    datos.push([d, Math.round(r.spend * 100) / 100, r.clicks, r.impressions, r.conv, '']);
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = NOMBRE_HOJA_GASTO ? ss.getSheetByName(NOMBRE_HOJA_GASTO) : ss.getSheets()[0];
  if (!hoja) throw new Error('No encontre la pestaña destino.');

  var ultimaFila = hoja.getLastRow();
  if (ultimaFila > datos.length) {
    hoja.getRange(datos.length + 1, 1, ultimaFila - datos.length, hoja.getLastColumn()).clearContent();
  }
  hoja.getRange(1, 1, datos.length, 6).setValues(datos);

  Logger.log('Actualizados ' + dias.length + ' dias (' + dias[0] + ' a ' + dias[dias.length - 1] + ').');
}


function traerInsights_() {
  var key = PropertiesService.getScriptProperties().getProperty('OPENAI_ADS_API_KEY');
  if (!key) {
    throw new Error('Falta OPENAI_ADS_API_KEY en Propiedades de la secuencia de comandos.');
  }

  var hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var rango = JSON.stringify({ type: 'date_range', since: INICIO, until: hoy, timezone: TZ });

  var params = [
    'aggregation_level=campaign',
    'time_granularity=daily',
    'time_ranges[]=' + encodeURIComponent(rango),
    'limit=2000'
  ];
  ['campaign_id', 'campaign_name', 'readable_time', 'start_time',
   'impressions', 'clicks', 'spend'].forEach(function (f) {
    params.push('fields[]=' + encodeURIComponent(f));
  });

  var url = BASE + '/ad_account/insights?' + params.join('&');
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var cuerpo = res.getContentText();
  if (code !== 200) {
    // El cuerpo crudo es lo que permite arreglar un desajuste de shape sin adivinar.
    throw new Error('API respondio ' + code + ': ' + cuerpo.slice(0, 600));
  }

  var json;
  try { json = JSON.parse(cuerpo); }
  catch (e) { throw new Error('Respuesta no es JSON: ' + cuerpo.slice(0, 300)); }

  if (!json || !json.data || !json.data.length) {
    Logger.log('Respuesta sin data: ' + cuerpo.slice(0, 600));
    return [];
  }
  if (json.has_more) {
    // Con una campaña y pocos dias no deberia pasar. Si pasa, hay que paginar.
    Logger.log('AVISO: has_more = true. Faltan filas por traer.');
  }
  return json.data;
}


/**
 * La documentacion no fija el formato de `readable_time`, asi que probamos
 * en orden y nos quedamos con lo primero que de una fecha valida.
 */
function fechaDe_(f) {
  var candidatos = [f.start_time, f.readable_time, f.date, f.day];
  for (var i = 0; i < candidatos.length; i++) {
    var v = candidatos[i];
    if (!v) continue;
    var s = String(v);

    // Ya viene como YYYY-MM-DD (posiblemente con hora pegada).
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];

    // Epoch en segundos o milisegundos.
    if (/^\d{10}$/.test(s))  return Utilities.formatDate(new Date(+s * 1000), TZ, 'yyyy-MM-dd');
    if (/^\d{13}$/.test(s))  return Utilities.formatDate(new Date(+s), TZ, 'yyyy-MM-dd');

    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }
  return null;
}


function instalarDisparadorGasto() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualizarGasto') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarGasto').timeBased().everyHours(3).create();
  Logger.log('Disparador instalado: cada 3 horas.');
}
