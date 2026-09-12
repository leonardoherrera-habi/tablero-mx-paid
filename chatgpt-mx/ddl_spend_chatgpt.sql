-- =====================================================================
-- Gasto manual de ChatGPT Ads MX
--
-- MONEDA: la plataforma reporta en PESOS y siempre lo hara.
-- resumen_inversiones_mkt_mx esta en DOLARES (Facebook: 7.490 de gasto
-- contra 19.999 clics el 9-sep = 0,37 por clic; en pesos serian 2 centavos
-- de dolar por clic, imposible en Mexico).
--
-- Por eso se guardan las dos: spend_mxn es el dato original, intacto, y
-- tipo_cambio queda explicito para que la conversion sea auditable.
-- NUNCA unir spend_mxn con la tabla principal sin convertir: sumaria pesos
-- con dolares y los CPL saldrian creibles pero falsos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `papyrus-data-mx.habi_wh_bi.mkt_chatgpt_spend_mx`
(
  date              DATE      NOT NULL OPTIONS(description="Dia del gasto, hora de Mexico"),
  plataforma        STRING    OPTIONS(description="'Chatgpt' - mismo casing que el diccionario UTM"),
  campana           STRING,
  campana_original  STRING    OPTIONS(description="Nombre exacto en la plataforma. Llave del join"),
  spend_mxn         NUMERIC   OPTIONS(description="Inversion en PESOS, tal como la reporta la plataforma"),
  tipo_cambio       NUMERIC   OPTIONS(description="MXN por USD usado para derivar el gasto en dolares"),
  clicks            INT64,
  impressions       INT64,
  medio             STRING,
  canal_adquisicion STRING,
  objetivo_campana  STRING,
  cargado_en        TIMESTAMP,
  cargado_por       STRING
)
PARTITION BY date
OPTIONS(
  description = "Carga manual del gasto de ChatGPT Ads MX mientras no exista conector. spend_mxn en PESOS; la tabla principal esta en dolares, convertir con tipo_cambio antes de unir."
);
