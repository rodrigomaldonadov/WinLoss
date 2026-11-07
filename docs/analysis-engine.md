# Motor de análisis

## Flujo automático

El punto de entrada es:

```http
GET /api/cron/analysis-refresh
Authorization: Bearer <CRON_SECRET>
```

Ejecuta en orden:

1. Import incremental de archivos nuevos o modificados en `data-football/`.
2. Sync de próximos partidos desde TheSportsDB / football-data.org.
3. Recálculo de `MatchAnalysis` con ratings guardados; el reajuste de ratings
   corre como máximo una vez cada 7 días.

Cada paso se aísla: si uno falla, los demás continúan. Hay lock persistente,
límite de tiempo y un resumen por corrida en `AnalysisRefreshRun`. Los detalles
de despliegue y programación están en
[`docs/analysis-ops.md`](./analysis-ops.md).

Comandos manuales equivalentes (solo para diagnóstico):

```bash
npm run analysis:import
npm run analysis:sync
npm run analysis:generate
npm run analysis:refresh
npm run analysis:backtest
```

`analysis:refresh` ejecuta el flujo completo dentro del contenedor, con el mismo
lock y registro que el endpoint HTTP.

No hay scraping ni descarga automática de football-data.co.uk. La copia de CSV
es manual; el resto es automático.

## Fuentes y reglas

| Fuente | Disponibilidad | Confianza | Se mezcla en la final |
| --- | --- | --- | --- |
| Mercado | Cuotas de `data-football/fixtures/` con captura ≤4 días | Alta | Sí, es la base |
| Modelo | Liga doméstica con histórico suficiente | Media/Baja | Peso validado (hoy 0) |
| Comunidad | ≥5 usuarios distintos con opt-in anónimo | Baja | No |
| Historial propio | Picks del usuario para ese partido | Baja | No |

- **Probabilidad final**: mercado si existe. Si no existe mercado, modelo. Si el
  peso del modelo validado fuera >0, mezcla mercado+modelo. Hoy el peso es 0 en
  todas las ligas, así que el modelo se muestra aparte.
- **Sin mercado**: el modelo pasa a ser la probabilidad final con confianza
  Media/Baja y la nota fija:
  > En pruebas, el mercado superó a este modelo en todas las ligas
- **Sin backtest de liga**: se usa la línea base ingenua (frecuencias
  históricas local/empate/visitante) como referencia y se indica en la UI. El
  generador calcula esa referencia con un corte temporal 80/20 y la guarda en
  `MatchAnalysis.metadata.naiveReference`.
- **Copas internacionales**: modelo no disponible; solo mercado si existe.
- **Liga 1 (Perú)**: no está en football-data.co.uk y hoy no tiene histórico
  importado. TheSportsDB aporta partidos, pero el modelo queda insuficiente.
- **Comunidad**: solo agregados anónimos. Si un usuario desactiva
  `shareAnonymousStats`, se excluye. Nunca se muestran nombres, correos ni
  boletos.
- **Historial propio**: se calcula por usuario en la capa de datos, no se guarda
  en el análisis global.

## Fixtures de APIs

`analysis:sync` guarda próximos partidos de:

- football-data.org: Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 y
  Brasileirão (según plan).
- TheSportsDB: las anteriores más Liga Profesional y Liga 1.

Los partidos de APIs **no traen cuotas**. La fuente Mercado solo existe cuando
se coloca el CSV semanal en `data-football/fixtures/`. Los lotes anteriores de
cada proveedor se reemplazan en cada sincronización.

## Cruce de alias con APIs

Comando:

```bash
npm run analysis:aliases:api
```

Resultado de la prueba del 07/11/2026:

| Proveedor | Eventos | Menciones resueltas | Menciones sin alias | Sin historial en la liga |
| --- | ---: | ---: | ---: | ---: |
| football-data.org | 147 | 294 | 0 | 0 |
| TheSportsDB | 8 | 14 | 2 | 0 |

Los 2 nombres sin resolver son de **Liga 1**: `ADT` y `Sporting Cristal`. No
tienen histórico importado, por lo que no se inventa un alias ni una predicción.
El resto se resolvió con `team-aliases.json` (969 entradas explícitas).

Para añadir un alias:

1. Ejecuta `npm run analysis:aliases:api`.
2. Copia el nombre exacto y añade la clave normalizada en `team-aliases.json`.
3. Vuelve a ejecutar `analysis:sync` y `analysis:generate`.

No se crean alias automáticamente.

## Persistencia

- `TeamRating`: ataque/defensa por liga y equipo, con fecha de corte.
- `MatchAnalysis`: análisis generado para cada próximo partido, fuentes,
  confianza, referencia de backtest y notas.
- `ModelEvaluation`: métricas de modelo, mercado de cierre, pre-cierre,
  calibración y mezcla.
- `analysis-weights.json`: pesos y temperaturas versionados que usa el motor.

## Acceso desde la app

- `GET /api/cron/analysis-refresh`: job único import → sync → recálculo,
  protegido con `CRON_SECRET`.
- `GET /api/cron/settle`: auto-liquidación, cada 15–30 minutos.
- `GET /api/analysis?dias=7`: feed autenticado con comunidad y privado al vuelo.
- `GET /api/analysis/model`: números del panel “Precisión del modelo”.
- `/analysis`: tablero mobile-first con filtros de 3, 7 y 14 días y selección
  múltiple de competiciones. Cada partido aparece como:
  - **Mercado**: titular “Probabilidad del mercado (sin margen)” y comparador
    de cuotas justas (`1 / probabilidad`) cuando hay cuota.
  - **Modelo sin cuotas**: titular “Estimación del modelo (sin cuotas)”,
    confianza baja y el aviso fijo de que el mercado superó al modelo.
  - **Sin datos**: sección aparte “Sin análisis disponible”, sin
    probabilidades y con enlace para registrar la apuesta.
- Un indicador muestra el último import, la antigüedad del lote de cuotas y el
  resultado de la última corrida. Si las cuotas superan 4 días, avisa de que la
  fuente Mercado está desactualizada y se oculta.
- El comparador permite escribir la cuota de la casa del usuario y la compara
  con la cuota justa del mercado. El texto es neutro (“X% mejor/peor que la
  cuota justa del mercado”) y no es una recomendación.
- Tocar 1, X, 2, Más/Menos 2.5 o ambos marcan precarga mercado, línea y
  selección en `/bets/new`, nunca la cuota. Tocar el partido precarga solo
  evento, competición y fecha.
- `/analysis/[id]`: detalle con Probabilidades, Fuentes, Forma reciente y H2H,
  Tu historial y Calidad de datos. No es una recomendación.
- `GET /api/analysis/model` alimenta el panel de precisión con N, periodo y
  baselines de cierre, pre-cierre e ingenua. La UI usa la misma función de la
  capa de datos para evitar un salto HTTP interno.
- `/bets/new?...` muestra un aviso “Precargado desde Consenso”.

La capa de datos está en `src/lib/data/analysis.ts` y
`src/lib/data/analysis-status.ts`; los jobs en `src/lib/analysis/jobs/`; las
vistas y helpers puros en `src/lib/analysis/view.ts` y
`src/components/analysis/`.


## Limitaciones

- El mercado de APIs no está disponible; las cuotas siguen viniendo del CSV.
- El modelo se ajusta una vez por ejecución de `analysis:generate`, no en cada
  petición.
- Los equipos recién ascendidos arrancan en la media de su liga.
- La comunidad depende de que los picks tengan un `eventName` reconocible y una
  fecha cercana al partido.
