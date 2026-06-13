# Refresh local — tablero-mx-paid

Automatiza el refresh diario de `data.json` desde tu laptop. Reemplaza al GitHub
Actions workflow porque la org Habi bloquea Drive scope para gcloud CLI, lo que
hace imposible que un Service Account lea el UTM dict (tabla externa sobre Sheets).

## Cómo funciona

1. Playwright abre Chromium y carga BQ Studio Web (que sí tiene Drive scope vía
   tu OAuth de navegador).
2. Capturamos el `Authorization: Bearer <token>` que BQ Studio envía a la API.
3. Cerramos el browser y disparamos `query.sql` contra la **REST API de BigQuery**
   directamente, con ese token.
4. Procesamos los resultados a `data.json` (misma lógica que el workflow Python).
5. `git commit && git push`.

## Setup (una sola vez)

```powershell
cd C:\Users\leonardoherrera_tuha\habi\tablero-mx-paid\automation
npm install
npx playwright install chromium
npm run auth
```

`npm run auth` abre Chrome visible. Loguéate en BQ Studio con
`leonardoherrera@tuhabi.mx`, espera a ver el editor SQL, y vuelve a la terminal a
presionar ENTER. Se crea `auth-state.json` con tu sesión.

## Corrida diaria manual

```powershell
npm run refresh
```

Headless. Tarda ~1-2 min. Si data.json cambió, commitea y pushea.

## Debug

```powershell
npm run refresh:headed
```

Muestra el browser para que veas qué pasa.

## Cuándo re-autenticar

Si ves `No se capturó access_token` o `BQ API 401`, la sesión expiró (típico tras
~14 días o si Google forzó re-login). Corre `npm run auth` de nuevo.

## Limitaciones

- La laptop debe estar prendida a la hora del Task Scheduler.
- `query.sql` usa `CURRENT_DATE()` (UTC). Si corres después de las ~6 PM MX,
  podría traer datos parciales del día actual. Para corte estricto MX, cambiar
  a `CURRENT_DATE('America/Mexico_City')` en query.sql.
