/* =====================================================================
   Alerta diaria por correo: "sin ask price" (fuente Web, MX)

   Lee la pestaña "Extracto 1" de la hoja ask-price-data-prod — la misma que
   alimenta el tablero — y aplica las reglas de alertas_ask_price.js.
   Manda correo sólo cuando aparece una alerta NUEVA, más un resumen los lunes
   de lo que siga activo. Así no se vuelve ruido.

   INSTALACIÓN (una vez, ~5 minutos):
     1. Abre la hoja ask-price-data-prod → Extensiones → Apps Script.
     2. Crea dos archivos de script (+ → Secuencia de comandos):
          alertas_ask_price   → pega el contenido de alertas_ask_price.js (raíz del repo)
          alerta_correo       → pega ESTE archivo
     3. Ajusta CONFIG abajo si quieres otros destinatarios u hora.
     4. Elige la función `probarCorreo` y dale Ejecutar. Acepta los permisos
        (leer la hoja y mandar correo como tú). Te llega un correo de prueba.
     5. Elige la función `instalar` y dale Ejecutar. Crea el disparador diario.

   Si cambias un umbral en alertas_ask_price.js, vuelve a pegarlo aquí:
   el repositorio no se sincroniza solo con Apps Script.
   ===================================================================== */

var CONFIG = {
  HOJA: 'Extracto 1',
  FUENTE: 'Web',
  DESTINATARIOS: '',   // vacío = tu propio correo. Varios: 'a@x.com,b@x.com'
  HORA: 9,             // hora del disparador diario (zona del proyecto). Debe ir DESPUÉS de la actualización programada del extracto.
  TABLERO: 'https://leonardoherrera-habi.github.io/tablero-mx-paid/ask_price_dashboard_v2.html'
};

function leerFilas_() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJA);
  if (!hoja) throw new Error('No encuentro la pestaña "' + CONFIG.HOJA + '"');
  var valores = hoja.getDataRange().getValues();
  var enc = valores[0].map(function (h) { return String(h).trim().toLowerCase(); });
  return valores.slice(1).filter(function (r) { return r[0] !== '' && r[0] !== null; }).map(function (r) {
    var o = {};
    enc.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function claveAlerta_(a) { return a.tipo + '|' + a.canal + '|' + (a.anuncio || ''); }

function destinatarios_() {
  return CONFIG.DESTINATARIOS || Session.getEffectiveUser().getEmail();
}

/* Disparo diario. */
function revisarAlertas() { correr_(false); }

/* Manda el correo aunque no haya nada nuevo, para probar. No toca el registro de alertas vistas. */
function probarCorreo() { correr_(true); }

function correr_(forzar) {
  var filas = ReglasAlerta.normalizar(leerFilas_(), CONFIG.FUENTE);
  var hoy = ReglasAlerta.hoyUTC();
  var alertas = ReglasAlerta.evaluar(filas, hoy);

  // Frescura: si el extracto no trae ayer, la actualización programada falló.
  var ultimo = filas.reduce(function (m, r) { return Math.max(m, r.t); }, 0);
  var desactualizado = ultimo < hoy - 864e5;

  var props = PropertiesService.getScriptProperties();
  var previas = JSON.parse(props.getProperty('alertas_previas') || '[]');
  var nuevas = alertas.filter(function (a) { return previas.indexOf(claveAlerta_(a)) < 0; });
  var esLunes = new Date().getDay() === 1;

  var mandar = forzar || desactualizado || nuevas.length > 0 || (esLunes && alertas.length > 0);
  if (mandar) MailApp.sendEmail({
    to: destinatarios_(),
    subject: asunto_(alertas, nuevas, desactualizado, forzar),
    htmlBody: cuerpo_(alertas, nuevas, desactualizado, ultimo)
  });

  if (!forzar) props.setProperty('alertas_previas', JSON.stringify(alertas.map(claveAlerta_)));
}

function asunto_(alertas, nuevas, desactualizado, forzar) {
  if (desactualizado) return '⚠️ Ask price: el extracto no se actualizó';
  if (forzar && !alertas.length) return '✅ Ask price: prueba — sin alertas hoy';
  var canales = {};
  (nuevas.length ? nuevas : alertas).forEach(function (a) { canales[a.canal] = true; });
  var n = nuevas.length;
  return (n ? '⚠️ Ask price: ' + n + (n === 1 ? ' alerta nueva' : ' alertas nuevas')
            : '🔁 Ask price: ' + alertas.length + ' alertas siguen activas') +
         ' (' + Object.keys(canales).join(', ') + ')' + (forzar ? ' — prueba' : '');
}

function cuerpo_(alertas, nuevas, desactualizado, ultimo) {
  var esNueva = {};
  nuevas.forEach(function (a) { esNueva[claveAlerta_(a)] = true; });
  var cfg = ReglasAlerta.CFG;
  var td = 'style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px"';
  var h = '<div style="font-family:Arial,sans-serif;color:#222;max-width:760px">';

  if (desactualizado) {
    h += '<p style="background:#fef3c7;padding:10px;border-radius:6px">El último día con datos en "' + CONFIG.HOJA +
         '" es el ' + Utilities.formatDate(new Date(ultimo), 'UTC', 'dd/MM/yyyy') +
         '. Revisa la actualización programada de la hoja vinculada (Opciones de actualización).</p>';
  }

  alertas.filter(function (a) { return a.tipo === 'canal'; }).forEach(function (a) {
    h += '<p style="background:#fee2e2;padding:10px;border-radius:6px;margin:8px 0"><b>' +
         (esNueva[claveAlerta_(a)] ? '🆕 ' : '') + a.texto + '</b></p>';
  });

  var ads = alertas.filter(function (a) { return a.tipo === 'anuncio'; });
  if (ads.length) {
    h += '<p style="margin:16px 0 6px"><b>Anuncios que están empujando el % sin ask price</b> (últimos ' + cfg.ventana + ' días, fuente ' + CONFIG.FUENTE + ')</p>' +
         '<table style="border-collapse:collapse;width:100%"><tr style="background:#f5f5f5">' +
         ['Anuncio', 'Campaña', 'Medio', 'Leads', '% sin', 'Share', 'Aporta'].map(function (t) { return '<th ' + td + ' align="left">' + t + '</th>'; }).join('') + '</tr>';
    ads.forEach(function (a) {
      h += '<tr><td ' + td + '>' + (esNueva[claveAlerta_(a)] ? '🆕 ' : '') + '<b>' + a.anuncio + '</b></td>' +
           '<td ' + td + '>' + String(a.campana).replace(/^FB_HabiWeb_Conversiones_/, '') + '</td>' +
           '<td ' + td + '>' + a.canal + '</td>' +
           '<td ' + td + ' align="right">' + a.leads + '</td>' +
           '<td ' + td + ' align="right"><b style="color:#b91c1c">' + a.pct.toFixed(0) + '%</b></td>' +
           '<td ' + td + ' align="right">' + (a.nuevo ? 'nuevo' : a.shareBase.toFixed(0) + '%') + ' → ' + a.share.toFixed(0) + '%</td>' +
           '<td ' + td + ' align="right">' + a.aporte.toFixed(0) + '%</td></tr>';
    });
    h += '</table>';
  }

  if (!alertas.length && !desactualizado) h += '<p>Sin alertas hoy.</p>';

  h += '<p style="font-size:12px;color:#666;margin-top:16px">🆕 = apareció hoy. Canal: sube ' + cfg.subidaCanal +
       '+ pts contra sus ' + cfg.base + ' días previos. Anuncio: ≥' + cfg.minLeadsAnuncio + ' leads, ≥' + cfg.pctMinAnuncio +
       '% sin precio, ≥' + cfg.shareMin + '% de los leads del canal y ganando peso (o nuevo, o aporta ≥' + cfg.aporteMin +
       '% de los sin precio).<br><a href="' + CONFIG.TABLERO + '">Abrir el tablero de Ask Price</a></p></div>';
  return h;
}

/* Crea (o recrea) el disparador diario. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarAlertas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarAlertas').timeBased().everyDays(1).atHour(CONFIG.HORA).create();
  // Primera corrida: manda las alertas activas hoy y las registra, para que desde mañana solo avise lo nuevo.
  revisarAlertas();
}
