-- =====================================================================
-- 1) Tabla de gasto manual de ChatGPT Ads (MX)
--    Vive junto a resumen_inversiones_mkt_mx para que el UNION sea local.
--    Espeja las columnas de dimension de la tabla principal, de modo que
--    el dia que llegue el conector se pueda apagar sin tocar el tablero.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `papyrus-data-mx.habi_wh_bi.mkt_chatgpt_spend_mx`
(
  date              DATE      NOT NULL OPTIONS(description="Dia del gasto, zona MX"),
  plataforma        STRING    OPTIONS(description="Siempre 'Chatgpt'"),
  campana           STRING    OPTIONS(description="Nombre normalizado"),
  campana_original  STRING    OPTIONS(description="Nombre exacto en la plataforma. Llave del join"),
  spend             FLOAT64   OPTIONS(description="Inversion en USD"),
  clicks            INT64,
  impressions       INT64,
  medio             STRING    OPTIONS(description="'Paid'"),
  canal_adquisicion STRING    OPTIONS(description="'WEB Paid'"),
  objetivo_campana  STRING    OPTIONS(description="'Conversiones'"),
  cargado_en        TIMESTAMP OPTIONS(description="Auditoria de carga manual"),
  cargado_por       STRING
)
PARTITION BY date
OPTIONS(
  description = "Carga manual del gasto de ChatGPT Ads MX mientras no exista conector. Se une por UNION ALL a resumen_inversiones_mkt_mx en el tablero. Al llegar el conector, dejar de cargar: la query prioriza la fuente automatica."
);


-- ---------------------------------------------------------------------
-- 2) Carga semanal. MERGE, no INSERT: la carga manual se re-corre y
--    un INSERT duplicaria dias. El MERGE es idempotente.
-- ---------------------------------------------------------------------

MERGE `papyrus-data-mx.habi_wh_bi.mkt_chatgpt_spend_mx` T
USING (
  SELECT * FROM UNNEST([
    -- date, spend, clicks, impressions   <- una fila por dia
    STRUCT(DATE '2026-09-15' AS date, 0.0 AS spend, 0 AS clicks, 0 AS impressions)
    -- , STRUCT(DATE '2026-09-16', 0.0, 0, 0)
  ])
) S
ON  T.date = S.date
AND T.campana_original = 'Tuhabi_Chatgpt_Conversiones_MX_Nacional'
WHEN MATCHED THEN UPDATE SET
  spend = S.spend, clicks = S.clicks, impressions = S.impressions,
  cargado_en = CURRENT_TIMESTAMP(), cargado_por = SESSION_USER()
WHEN NOT MATCHED THEN INSERT (
  date, plataforma, campana, campana_original,
  spend, clicks, impressions,
  medio, canal_adquisicion, objetivo_campana, cargado_en, cargado_por
) VALUES (
  S.date, 'Chatgpt',
  'Tuhabi_Chatgpt_Conversiones_MX_Nacional',
  'Tuhabi_Chatgpt_Conversiones_MX_Nacional',
  S.spend, S.clicks, S.impressions,
  'Paid', 'WEB Paid', 'Conversiones', CURRENT_TIMESTAMP(), SESSION_USER()
);


-- ---------------------------------------------------------------------
-- 3) Diccionario UTM: NO HAY NADA QUE CORRER. Verificado 2026-09-09.
--
--    registro_unico_utm_mkt_mexico es una EXTERNAL TABLE sobre una hoja
--    de Google (is_insertable_into = NO). No admite INSERT. El alta se
--    hace agregando un renglon a la hoja, pestana "MX":
--    docs.google.com/spreadsheets/d/1sBg4hIBzWDTfZhORtr-HtVIfxvnILmJqCqfzuk1Jpxk
--
--    Y la campana YA ESTA registrada ahi:
--      campana_mercadeo_original : Tuhabi_Chatgpt_Conversiones_MX_Nacional
--      mkt_campaign_name         : Tuhabi_Chatgpt_Conversiones_MX_Nacional
--      mkt_channel_big           : WEB
--      mkt_channel_medium        : WEB Paid
--      mkt_channel_small         : (vacio)  <- igual que el resto de WEB Paid
--      mkt_media                 : Paid
--      mkt_platform              : Chatgpt  <- OJO: asi, no "ChatGPT"
--
--    El casing "Chatgpt" es el que manda. Sigue la convencion del resto
--    de la hoja (Facebook, Google, Blog) y es la llave de agrupacion, asi
--    que todo lo demas se alinea a el, no al reves.
-- ---------------------------------------------------------------------
