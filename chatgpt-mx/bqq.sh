#!/usr/bin/env bash
# Corre una query en BigQuery via API REST.
# El bq CLI no conecta en esta maquina (su Python empaquetado se cuelga en TCP);
# curl si llega. Node es nativo de Windows, por eso rutas relativas, no /tmp.
# Uso: ./bqq.sh archivo.sql
set -euo pipefail
export CLOUDSDK_PYTHON="/c/Users/leonardoherrera_tuha/AppData/Local/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe"
PROJECT="${BQ_PROJECT:-papyrus-data-mx}"
mkdir -p .bqtmp
TOKEN=$(gcloud auth print-access-token 2>/dev/null)
SQLFILE="$1"
node -e '
const fs=require("fs");
const sql=fs.readFileSync(process.argv[1],"utf8");
fs.writeFileSync(".bqtmp/body.json",JSON.stringify({query:sql,useLegacySql:false,timeoutMs:180000,maxResults:2000}));
' "$SQLFILE"
curl -s --max-time 180 -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data @.bqtmp/body.json \
  "https://bigquery.googleapis.com/bigquery/v2/projects/$PROJECT/queries" > .bqtmp/out.json
node -e '
const r=JSON.parse(require("fs").readFileSync(".bqtmp/out.json","utf8"));
if(r.error){console.error("ERROR:",r.error.message);process.exit(1);}
const cols=(r.schema&&r.schema.fields||[]).map(f=>f.name);
const rows=(r.rows||[]).map(x=>x.f.map(c=>c.v===null?"NULL":String(c.v)));
if(!cols.length){console.log("(sin resultados)");process.exit(0);}
const w=cols.map((c,i)=>Math.max(c.length,...rows.map(r=>(r[i]||"").length),3));
console.log(cols.map((c,i)=>c.padEnd(w[i])).join(" | "));
console.log(w.map(n=>"-".repeat(n)).join("-+-"));
rows.forEach(r=>console.log(r.map((v,i)=>(v||"").padEnd(w[i])).join(" | ")));
console.log("\n"+rows.length+" fila(s)"+(r.totalRows&&+r.totalRows>rows.length?" de "+r.totalRows:""));
'
