# Operación de /analysis

## Resumen

La actualización de `/analysis` es automática. Lo único manual es **copiar** los
archivos descargados a `data-football/`; la descarga automática desde
football-data.co.uk está prohibida por su licencia y no se implementa.

El job programado:

1. Importa solo archivos nuevos o modificados de `data-football/`.
2. Sincroniza próximos partidos desde las APIs deportivas.
3. Recalcula `MatchAnalysis` con los ratings disponibles.
4. Reajusta ratings como máximo una vez cada 7 días.

Todo se ejecuta desde un único punto de entrada:

```http
GET /api/cron/analysis-refresh
Authorization: Bearer <CRON_SECRET>
```

## Flujo semanal

1. Descarga manualmente los CSV de resultados y el CSV de fixtures.
2. Cópialos al volumen persistente, conservando la estructura:
   - `data-football/england/26-27/E0.csv`
   - `data-football/spain/26-27/SP1.csv`
   - `data-football/fixtures/fixtures.csv`
3. No hace falta ejecutar nada más: la siguiente corrida del cron los detecta
   por hash/mtime, importa solo lo nuevo y recalcula el análisis.
4. Si quieres forzarlo antes de la siguiente ventana:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://tu-dominio/api/cron/analysis-refresh
```

Los lotes de fixtures se reemplazan cuando llega uno nuevo. Un lote con más de
4 días de antigüedad descarta sus cuotas y la fuente **Mercado** se oculta.

## Programación recomendada

### Dokploy

Crea dos *Scheduled Tasks* (o *Cron Jobs*) en el servicio:

| Tarea | Expresión | Comando |
| --- | --- | --- |
| Liquidación | `*/20 * * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/settle` |
| Análisis | `0 */6 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/analysis-refresh` |
| Extra fixtures | `0 18 * * 5` | igual que Análisis |
| Extra fixtures | `0 18 * * 2` | igual que Análisis |

La corrida cada 6 horas ya cubre el día; las ejecuciones extra de viernes y
martes por la tarde sirven para procesar los fixtures recién publicados sin
esperar a la siguiente ventana. Ajusta la hora a la zona del servidor
(`TZ=Europe/London` o `TZ=America/Lima`, por ejemplo).

### Cron de un VPS

Guarda el secreto en un archivo con permisos restringidos:

```bash
sudo install -m 600 /dev/null /etc/winloss/cron.env
sudo tee /etc/winloss/cron.env >/dev/null <<'EOF'
CRON_SECRET=reemplaza-por-tu-secreto
EOF
```

Crontab:

```cron
*/20 * * * * . /etc/winloss/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/settle >/dev/null
0 */6 * * * . /etc/winloss/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/analysis-refresh >/dev/null
0 18 * * 5 . /etc/winloss/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/analysis-refresh >/dev/null
0 18 * * 2 . /etc/winloss/cron.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/analysis-refresh >/dev/null
```

No pongas el secreto en la URL ni en logs. El endpoint también acepta
`?secret=`, pero el header es preferible.

## Despliegue en Dokploy/VPS

### Volumen persistente

`data-football/` **no va en la imagen**. Monta un volumen persistente:

```text
Host:      /srv/winloss/data-football
Container: /app/data-football
```

Si montas en otra ruta, define `ANALYSIS_DATA_DIR` con esa ruta. El directorio
debe ser escribible por el usuario del contenedor solo si el import necesita
leerlo; la app no escribe CSV, solo los lee.

### Variables de entorno

```dotenv
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
CRON_SECRET="..."

# APIs deportivas
FOOTBALL_DATA_API_KEY="..."
THESPORTSDB_API_KEY="123"

# Job de análisis
ANALYSIS_DATA_DIR="/app/data-football"
ANALYSIS_WINDOW_DAYS="14"
ANALYSIS_RATING_MAX_AGE_DAYS="7"
ANALYSIS_REFRESH_TIMEOUT_MS="840000"
```

- `CRON_SECRET`: obligatorio para `/api/cron/analysis-refresh` y
  `/api/cron/settle`.
- `FOOTBALL_DATA_API_KEY`: opcional; sin clave se usa solo TheSportsDB.
- `THESPORTSDB_API_KEY`: `123` es la clave pública de prueba; usa una propia si
  tienes plan.
- `ANALYSIS_DATA_DIR`: ruta del volumen persistente.
- `ANALYSIS_RATING_MAX_AGE_DAYS`: control semanal de ratings (por defecto 7).
- `ANALYSIS_REFRESH_TIMEOUT_MS`: límite del job completo. La ruta declara
  `maxDuration = 900`; configura el proxy con un timeout mayor.

### Comprobar que la imagen no contiene CSV

```bash
docker run --rm tu-imagen:tag \
  sh -c 'find /app -name "*.csv" -not -path "*/node_modules/*"'
```

No debe listar archivos. `.dockerignore` excluye `data-football/`; `.gitignore`
también lo excluye del repositorio. Si Dokploy/Nixpacks construye desde el
contexto de Git, la carpeta ni siquiera entra en el build. Si usas un Dockerfile
propio, asegúrate de que el `COPY` respete `.dockerignore`.

### Ejecutar comandos dentro del contenedor

Si la imagen conserva las dependencias de desarrollo y `tsx`:

```bash
docker exec -it <contenedor> npm run analysis:import
docker exec -it <contenedor> npm run analysis:sync
docker exec -it <contenedor> npm run analysis:generate
```

Para reprocesar todos los CSV aunque no hayan cambiado:

```bash
docker exec -it <contenedor> npm run analysis:import -- --force
```

Si la imagen poda devDependencies, usa el endpoint programado o reconstruye la
imagen con las dependencias necesarias. El job de la app no depende de `tsx`:
usa los mismos módulos desde `src/lib/analysis/jobs/`.

## Qué devuelve el endpoint

```json
{
  "ok": true,
  "logged": true,
  "status": "SUCCESS",
  "startedAt": "2026-11-07T18:00:00.000Z",
  "finishedAt": "2026-11-07T18:01:12.000Z",
  "durationMs": 72000,
  "steps": [
    { "name": "import", "status": "success", "durationMs": 1200 },
    { "name": "sync", "status": "success", "durationMs": 68000 },
    { "name": "generate", "status": "success", "durationMs": 2800 }
  ]
}
```

- `SUCCESS`: los tres pasos terminaron bien.
- `PARTIAL`: al menos uno falló; los demás siguieron.
- `FAILED`: ningún paso terminó bien.
- `SKIPPED`: ya había una corrida en curso (`reason: "locked"`).

Cada corrida se guarda en `AnalysisRefreshRun` con sus pasos, duración y error.
Para revisar las últimas:

```sql
SELECT "startedAt", "status", "durationMs", "steps", "error"
FROM "AnalysisRefreshRun"
ORDER BY "startedAt" DESC
LIMIT 5;
```

El lock está en `AnalysisRefreshLock` y caduca solo; si el proceso muere, la
siguiente corrida puede tomarlo cuando expire.

## Solución de problemas

### Alias sin resolver

El resumen muestra nombres como `ADT` o `Sporting Cristal`. Añade una entrada
explícita en `team-aliases.json` y espera la siguiente corrida (o ejecuta
`analysis:sync`). No se crean alias automáticos.

### Fuente de mercado vacía

Comprueba:

1. Que exista `data-football/fixtures/` con un CSV de fixtures.
2. Que el CSV tenga las columnas de cuotas (`AvgH`, `AvgD`, `AvgA` o las de
   cierre) y partidos futuros.
3. Que el lote no tenga más de 4 días: si es antiguo, sus cuotas se descartan.
4. El estado en `/analysis` y en `AnalysisImportFile`.
5. Los logs de la corrida y el campo `errors`.

### El import no hace nada

Es lo esperado si ningún archivo cambió: se compara tamaño/mtime y hash. Para
forzar:

```bash
npm run analysis:import -- --force
```

### Corrida omitida por lock

Significa que otra ejecución sigue activa. Espera a que termine; el lock caduca
solo. No lances corridas manuales en paralelo.

### Proveedor caído

El job continúa con el otro proveedor y conserva el lote anterior del que falló.
El resumen queda en `PARTIAL` y `errors` indica qué competición falló.

### Timeout

Si el job se corta por tiempo, revisa `ANALYSIS_REFRESH_TIMEOUT_MS`, el timeout
del proxy y la duración de `sync`. Los análisis anteriores se conservan si el
recálculo no llegó a guardar.

### 401 o 503

- `401`: `CRON_SECRET` no coincide.
- `503`: `CRON_SECRET` no está configurado.

## Estado en la app

`/analysis` muestra:

- Fecha del último import.
- Antigüedad del lote de cuotas.
- Resultado y duración de la última corrida.
- Aviso si el mercado está desactualizado (>4 días) y se está ocultando.

El detalle `/analysis/[id]` incluye el mismo estado dentro de **Calidad de
datos**.
