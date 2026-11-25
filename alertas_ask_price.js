/* =====================================================================
   Reglas de alerta de "sin ask price" — compartidas por el tablero
   (ask_price_dashboard_v2.html) y el correo diario
   (automation/AppsScript_alerta_ask_price.gs). Si cambias un umbral, pega
   este archivo otra vez en Apps Script: el repositorio no se sincroniza solo.

   Por qué existen: en oct–nov 2026 el % sin ask price de Meta Web pasó de
   ~17% a ~40% sin que nadie lo viera. No fue una campaña: fueron anuncios
   nuevos (Reel_Surrealista, la serie Rosa…) con 65–75% sin precio que
   fueron ganando share. La alerta vieja marcaba a Meta en rojo SIEMPRE
   (umbral fijo de 20%), así que dejó de leerse.

   Ahora se compara cada canal contra SU PROPIA línea base, y se señalan los
   anuncios que explican la subida. Backtest sobre ago–nov 2026:
     Meta           12-oct  (17% → 23%)
     Reel_Surrealista 20-oct · Avatar_2_Reel 3-nov · Rosa_Carrusel_TP 7-nov
     Rosa_Estatico_1 9-nov · Rosa_Estatico_2_TP 16-nov · Erika_2 18-nov

   Entrada: filas { t (ms UTC del día), canal, anuncio, n (leads), s (sin precio) }
   ya filtradas a la fuente que se quiera vigilar (Web).
   ===================================================================== */
var ReglasAlerta = (function () {
  var DIA = 864e5;
  var CFG = {
    ventana: 7,          // días recientes (completos, sin hoy)
    base: 21,            // días de línea base, justo antes de la ventana
    // Canal
    minLeadsCanal: 50,
    subidaCanal: 5,      // pts de subida del % sin precio contra su base
    // Anuncio
    minLeadsAnuncio: 10,
    pctMinAnuncio: 40,   // % sin precio mínimo del anuncio…
    sobreBase: 20,       // …y al menos estos pts sobre el % base del canal
    shareMin: 5,         // % mínimo de los leads del canal en la ventana
    subidaShare: 4,      // pts de share ganados contra la base…
    aporteMin: 10,       // …o aportar al menos este % de los sin precio del canal
    shareMax: 90         // si el anuncio ES el canal, ya lo cubre la alerta de canal
  };

  function sumar(filas) {
    var n = 0, s = 0;
    for (var i = 0; i < filas.length; i++) { n += filas[i].n; s += filas[i].s; }
    return { n: n, s: s, pct: n ? 100 * s / n : null };
  }

  /* hoy = ms UTC de las 00:00 del día de hoy. Devuelve una lista de alertas:
     { tipo: 'canal'|'anuncio', canal, anuncio?, campana?, leads, pct, pctBase?,
       share?, shareBase?, aporte?, nuevo?, texto }                          */
  function evaluar(filas, hoy) {
    var iniR = hoy - CFG.ventana * DIA, iniB = iniR - CFG.base * DIA;
    var R = filas.filter(function (r) { return r.t >= iniR && r.t < hoy; });
    var B = filas.filter(function (r) { return r.t >= iniB && r.t < iniR; });
    var out = [];
    var canales = {};
    R.forEach(function (r) { canales[r.canal] = true; });

    Object.keys(canales).sort().forEach(function (canal) {
      var rc = R.filter(function (r) { return r.canal === canal; });
      var bc = B.filter(function (r) { return r.canal === canal; });
      var tc = sumar(rc), tb = sumar(bc);
      if (!tc.n) return;

      var ads = {};
      rc.forEach(function (r) { (ads[r.anuncio] = ads[r.anuncio] || { R: [], B: [], camp: {} }).R.push(r); ads[r.anuncio].camp[r.campana] = (ads[r.anuncio].camp[r.campana] || 0) + r.n; });
      bc.forEach(function (r) { (ads[r.anuncio] = ads[r.anuncio] || { R: [], B: [], camp: {} }).B.push(r); });

      var delCanal = [];
      Object.keys(ads).forEach(function (ad) {
        if (!ad || ad === '(sin anuncio)') return;
        var a = sumar(ads[ad].R), b = sumar(ads[ad].B);
        if (a.n < CFG.minLeadsAnuncio) return;
        var umbral = Math.max(CFG.pctMinAnuncio, (tb.pct || 0) + CFG.sobreBase);
        if (a.pct < umbral) return;
        var share = 100 * a.n / tc.n;
        var shareB = tb.n ? 100 * b.n / tb.n : 0;
        var aporte = tc.s ? 100 * a.s / tc.s : 0;
        var nuevo = b.n < 5;
        if (share < CFG.shareMin || share >= CFG.shareMax) return;
        if (!nuevo && share - shareB < CFG.subidaShare && aporte < CFG.aporteMin) return;
        var camps = ads[ad].camp;
        var campana = Object.keys(camps).sort(function (x, y) { return camps[y] - camps[x]; })[0] || '';
        var al = {
          tipo: 'anuncio', canal: canal, anuncio: ad, campana: campana,
          leads: a.n, pct: a.pct, share: share, shareBase: shareB, aporte: aporte, nuevo: nuevo,
          texto: a.pct.toFixed(0) + '% sin precio en ' + a.n + ' leads · share ' +
                 (nuevo ? 'nuevo' : shareB.toFixed(0) + '%') + ' → ' + share.toFixed(0) + '% · aporta ' +
                 aporte.toFixed(0) + '% de los sin precio de ' + canal
        };
        delCanal.push(al);
      });
      delCanal.sort(function (x, y) { return y.aporte - x.aporte; });

      if (tc.n >= CFG.minLeadsCanal && tb.pct !== null && tc.pct - tb.pct >= CFG.subidaCanal) {
        out.push({
          tipo: 'canal', canal: canal, leads: tc.n, pct: tc.pct, pctBase: tb.pct,
          texto: canal + ' subió de ' + tb.pct.toFixed(0) + '% a ' + tc.pct.toFixed(0) +
                 '% sin precio (+' + (tc.pct - tb.pct).toFixed(0) + ' pts, últimos ' + CFG.ventana +
                 ' días contra los ' + CFG.base + ' anteriores)'
        });
      }
      out.push.apply(out, delCanal);
    });
    return out;
  }

  // Convierte filas del CSV/hoja (fecha dd/mm/yyyy, números con coma o punto) al formato de evaluar().
  function normalizar(filasHoja, fuente) {
    return filasHoja.filter(function (r) { return !fuente || r.fuente === fuente; }).map(function (r) {
      var f = r.fecha;
      var t;
      if (f instanceof Date) t = Date.UTC(f.getFullYear(), f.getMonth(), f.getDate());
      else { var p = String(f).split('/'); t = Date.UTC(+p[2], +p[1] - 1, +p[0]); }
      return { t: t, canal: r.canal, campana: r.campana || '', anuncio: r.anuncio || '',
               n: parseInt(r.total_leads, 10) || 0, s: parseInt(r.leads_without_price, 10) || 0 };
    });
  }

  function hoyUTC(d) {
    d = d || new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }

  return { evaluar: evaluar, normalizar: normalizar, hoyUTC: hoyUTC, CFG: CFG };
})();
if (typeof module !== 'undefined') module.exports = ReglasAlerta;
