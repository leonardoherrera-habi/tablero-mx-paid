# Pull: Registros / Calificados / Asignados — WEB + Google — MX

**Scope:** fuente WEB (`fuente_id=3`) + plataforma Google, MX, **excluyendo Habímetro** (`fuente_id=7`).
**Rango:** 2026-08-24 a 2026-09-04 · cohorte por `fecha_creacion`.
**Fuente:** BigQuery `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` (join dict UTM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`). Definiciones tomadas de `query.sql` del repo tablero-mx-paid.

## Definiciones
- **registros** = `COUNT(DISTINCT nid)` por `fecha_creacion`
- **calificados** = leads con `fecha_primer_calificacion IS NOT NULL`
- **asignados** = leads con `fecha_primer_asignacion IS NOT NULL`
- **WEB** = `fuente_id = 3` (excluye Habímetro=7, Lead Forms=47, Otros=0)
- **Google** = `mkt_platform = 'Google'` vía diccionario UTM sobre `campana_mercadeo`

## Totales del periodo
| Métrica | Total | Tasa |
|---|---|---|
| Registros | 1,376 | — |
| Calificados | 845 | 61.4% de registros |
| Asignados | 816 | 59.3% de registros · 96.6% de calificados |

## Detalle diario
| Fecha | Día | Registros | Calificados | Asignados |
|---|---|---|---|---|
| 2026-08-24 | Lun | 156 | 89 | 87 |
| 2026-08-25 | Mar | 148 | 92 | 96 |
| 2026-08-26 | Mié | 106 | 63 | 55 |
| 2026-08-27 | Jue | 98 | 55 | 56 |
| 2026-08-28 | Vie | 126 | 79 | 75 |
| 2026-08-29 | Sáb | 137 | 69 | 71 |
| 2026-08-30 | Dom | 158 | 84 | 91 |
| 2026-08-31 | Lun | 131 | 84 | 77 |
| 2026-09-01 | Mar | 90 | 68 | 61 |
| 2026-09-02 | Mié | 86 | 65 | 57 |
| 2026-09-03 | Jue | 76 | 51 | 47 |
| 2026-09-04 | Vie | 64 | 46 | 43 |

## Observación
Caída sostenida de volumen en la 2ª mitad: semana 24-30 ago = 929 registros vs 31ago-4sep = 447. Los últimos 4 días en picada (90→86→76→64). Calidad estable (calif ~61%, asig/calif ~97%): el tema es **entrada de registros**, no calidad. Revisar estacionalidad (inicio de mes) o pauta/tracking de Google.

## SQL (totales)
```sql
WITH dict AS (
  SELECT campana_mercadeo_original, ANY_VALUE(mkt_platform) AS pl
  FROM `sellers-main-prod.bi_mx.registro_unico_utm_mkt_mexico`
  WHERE campana_mercadeo_original IS NOT NULL
  GROUP BY campana_mercadeo_original
)
SELECT
  COUNT(DISTINCT tig.nid)                            AS registros,
  COUNTIF(tig.fecha_primer_calificacion IS NOT NULL) AS calificados,
  COUNTIF(tig.fecha_primer_asignacion   IS NOT NULL) AS asignados
FROM `papyrus-data-mx.habi_wh_bi.tabla_inmuebles_general` tig
LEFT JOIN dict d ON d.campana_mercadeo_original = tig.campana_mercadeo
WHERE DATE(tig.fecha_creacion) BETWEEN '2026-08-24' AND '2026-09-04'
  AND tig.fuente_id = 3
  AND d.pl = 'Google'
  AND tig.nid IS NOT NULL;
```
