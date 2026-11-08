# Modelo y backtest

## Qué hace el modelo

Modelo Poisson de fuerzas por equipo, ajustado **por competición**:

- Ataque y defensa de cada equipo, más ventaja de local.
- Decaimiento temporal con vida media de **365 días**: un partido de hace un año
  pesa la mitad que uno de hoy.
- Shrinkage ridge (**70**) para no sobrerreaccionar a muestras cortas.
- Corrección Dixon-Coles para marcadores bajos (0-0, 1-0, 0-1, 1-1), con `rho`
  estimado por máxima verosimilitud en cada ajuste.
- Matriz de marcadores 0-10 normalizada; de ahí salen 1X2, Over/Under 2.5 y
  ambos marcan.

El modelo **solo cubre ligas domésticas**. Para Champions, Europa League,
Libertadores y similares no hay modelo: la UI debe mostrar “Modelo no
disponible” y, si existe, la cuota de mercado.

Los ratings se reajustan como máximo una vez al día por liga cuando hay al menos
`ANALYSIS_RATING_MIN_NEW_RESULTS` resultados nuevos (5 por defecto). Si pasan 7
días sin alcanzar el umbral, se reajustan igualmente como respaldo semanal. El
job tiene un presupuesto de tiempo para ratings y usa los ratings guardados si
se agota. Un partido nunca usa datos de la misma semana ni posteriores. Los
análisis se recalculan cada 6 horas con los ratings disponibles.

## Mercado de referencia

La línea base es el **promedio de cierre** de football-data.co.uk (`AvgC*`),
normalizado para quitar el margen:

```text
p_i = (1 / cuota_i) / Σ (1 / cuota_j)
```

No se usa Pinnacle (`PSC*`) porque desde el **23/07/2025** esas cuotas están
desactualizadas. El importer directamente no las guarda.

## Backtest

- Periodo: **24/07/2025 → 06/11/2026** (holdout).
- 3.485 partidos de las 7 ligas objetivo con cuota de cierre 1X2.
- Reajuste semanal; métricas sobre todos los partidos del holdout.
- Brier 1X2 = suma de cuadrados sobre las tres probabilidades.

| Liga | N | Brier modelo | Brier mercado | Δ | LogLoss modelo | LogLoss mercado | Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Premier League | 470 | 0,6247 | 0,6084 | +2,7% | 1,0394 | 1,0132 | +2,6% |
| LaLiga | 489 | 0,5907 | 0,5633 | +4,9% | 0,9930 | 0,9521 | +4,3% |
| Serie A | 480 | 0,6069 | 0,5706 | +6,4% | 1,0142 | 0,9626 | +5,4% |
| Bundesliga | 378 | 0,5957 | 0,5713 | +4,3% | 0,9997 | 0,9633 | +3,8% |
| Ligue 1 | 387 | 0,6037 | 0,5785 | +4,4% | 1,0092 | 0,9712 | +3,9% |
| Brasileirão Serie A | 575 | 0,6075 | 0,5847 | +3,9% | 1,0145 | 0,9797 | +3,5% |
| Liga Profesional (ARG) | 706 | 0,6489 | 0,6316 | +2,8% | 1,0731 | 1,0489 | +2,3% |
| **Total** | **3.485** | **0,6141** | **0,5903** | **+4,0%** | **1,0245** | **0,9893** | **+3,6%** |

Acierto 1X2: modelo **49,4%**, mercado **51,5%**.

Over/Under 2.5 (solo ligas con cuotas de totales; Argentina y Brasil no las
tienen en la fuente):

| Liga | N | Brier modelo | Brier mercado | Δ | LogLoss modelo | LogLoss mercado | Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Premier League | 470 | 0,2484 | 0,2464 | +0,8% | 0,6900 | 0,6859 | +0,6% |
| LaLiga | 489 | 0,2448 | 0,2348 | +4,2% | 0,6826 | 0,6615 | +3,2% |
| Serie A | 480 | 0,2531 | 0,2499 | +1,3% | 0,6996 | 0,6932 | +0,9% |
| Bundesliga | 378 | 0,2336 | 0,2201 | +6,1% | 0,6593 | 0,6298 | +4,7% |
| Ligue 1 | 387 | 0,2474 | 0,2343 | +5,6% | 0,6879 | 0,6613 | +4,0% |
| **Total** | **2.204** | **0,2459** | **0,2379** | **+3,4%** | **0,6848** | **0,6681** | **+2,5%** |

### Mercado pre-cierre vs cierre

Mismo subconjunto de partidos con `AvgH/D/A` (solo ligas principales; Brasil y
Argentina no traen pre-cierre en la fuente). El modelo es el mismo en ambas
comparaciones.

| Liga | N pre | Brier modelo | Brier pre | Brier cierre | Δ modelo-pre | Δ modelo-cierre |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Premier League | 470 | 0,6247 | 0,6102 | 0,6084 | +2,4% | +2,7% |
| LaLiga | 489 | 0,5907 | 0,5649 | 0,5633 | +4,6% | +4,9% |
| Serie A | 480 | 0,6069 | 0,5704 | 0,5706 | +6,4% | +6,4% |
| Bundesliga | 378 | 0,5957 | 0,5711 | 0,5713 | +4,3% | +4,3% |
| Ligue 1 | 387 | 0,6037 | 0,5782 | 0,5785 | +4,4% | +4,4% |
| **Total** | **2.204** | **0,6046** | **0,5792** | **0,5785** | **+4,4%** | **+4,5%** |

Pre-cierre y cierre son casi equivalentes en este periodo; el cierre es
marginalmente mejor en conjunto. La normalización sin margen es la misma.

### Línea base ingenua

Frecuencias históricas local/empate/visitante de cada liga (con suavizado de
Laplace) evaluadas sobre el mismo holdout:

| Liga | Brier naive | Brier modelo |
| --- | ---: | ---: |
| Premier League | 0,6577 | 0,6247 |
| LaLiga | 0,6341 | 0,5907 |
| Serie A | 0,6562 | 0,6069 |
| Bundesliga | 0,6451 | 0,5957 |
| Ligue 1 | 0,6425 | 0,6037 |
| Brasileirão Serie A | 0,6282 | 0,6075 |
| Liga Profesional (ARG) | 0,6598 | 0,6489 |
| **Total** | **0,6467** | **0,6141** |

El modelo supera a la línea base ingenua en las siete ligas, pero no al mercado.
Para ligas sin backtest contra mercado se usa esta referencia y se indica
explícitamente en la UI.

### Recalibración walk-forward

Temperatura ajustada solo con semanas anteriores y evaluada en las siguientes.
`T > 1` suaviza; `T < 1` agudiza. Solo se aplica si mejora Brier **y** log-loss.

| Liga | N eval | Brier antes | Brier después | LogLoss antes | LogLoss después | T aplicada | ¿Aplica? |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Premier League | 270 | 0,6424 | 0,6470 | 1,0640 | 1,0702 | 1,00 | no |
| LaLiga | 281 | 0,5941 | 0,5899 | 0,9974 | 0,9902 | 0,64 | sí |
| Serie A | 272 | 0,5939 | 0,5748 | 0,9962 | 0,9705 | 0,57 | sí |
| Bundesliga | 172 | 0,6065 | 0,6093 | 1,0135 | 1,0173 | 1,00 | no |
| Ligue 1 | 180 | 0,6148 | 0,6161 | 1,0240 | 1,0246 | 1,00 | no |
| Brasileirão Serie A | 371 | 0,6083 | 0,6055 | 1,0159 | 1,0115 | 0,70 | sí |
| Liga Profesional (ARG) | 500 | 0,6463 | 0,6430 | 1,0692 | 1,0647 | 0,63 | sí |
| **Total** | **2.046** | **0,6187** | **0,6152** | **1,0306** | **1,0255** | — | — |

La recalibración mejora el conjunto y 4 de 7 ligas. En las otras 3 se deja
`T = 1` para no empeorar el backtest.

### Temperatura global vs una por liga

También se evaluó una sola temperatura walk-forward para todas las ligas, con
las mismas filas evaluadas:

| Calibración | N | Brier | LogLoss | T |
| --- | ---: | ---: | ---: | ---: |
| Sin calibrar | 1.823 | 0,6160 | 1,0267 | — |
| Global | 1.823 | 0,6128 | 1,0221 | 0,73 |
| Por liga | 1.823 | **0,6118** | **1,0205** | — |

La temperatura global **mejora al modelo sin calibrar**, pero **empeora
ligeramente frente a una temperatura por liga**. Por eso se mantiene la
calibración por liga. El resultado queda versionado en
`analysis-weights.json.globalCalibration`.

### Mezcla modelo/mercado

Validación temporal 60/40: el peso se ajusta en el primer tramo y se evalúa en
el siguiente, con rejilla 0,01 minimizando Brier. Si la mezcla no mejora al
mercado solo, el peso de producción es **0**.

| Liga | N test | Brier mercado | Brier mezcla | Peso aplicado | ¿Mejora? |
| --- | ---: | ---: | ---: | ---: | --- |
| Premier League | 108 | 0,6254 | 0,6254 | 0,00 | no |
| LaLiga | 113 | 0,5355 | 0,5355 | 0,00 | no |
| Serie A | 109 | 0,5277 | 0,5277 | 0,00 | no |
| Bundesliga | 69 | 0,6230 | 0,6230 | 0,00 | no |
| Ligue 1 | 72 | 0,5609 | 0,5609 | 0,00 | no |
| Brasileirão Serie A | 149 | 0,5661 | 0,5661 | 0,00 | no |
| Liga Profesional (ARG) | 200 | 0,6181 | 0,6181 | 0,00 | no |
| **Total** | **820** | **0,5816** | **0,5816** | **0,00** | **no** |

**Ninguna liga mejora al mercado al mezclar.** Por eso el peso del modelo en la
probabilidad final es 0: se muestra como fuente separada, nunca como mejora del
mercado. Los pesos y temperaturas quedan versionados en
`analysis-weights.json` y persistidos en `ModelEvaluation`.

## Forward test desde que está en uso

Cada vez que `analysis:generate` corre antes del inicio de un partido, guarda
una **captura inmutable** en `AnalysisSnapshot`: probabilidades de mercado y
modelo, confianza, fuente final, versión de ratings (`modelo:asOf`) y parámetros
del ajuste. Las regeneraciones posteriores crean nuevas capturas; no modifican
las anteriores. Si hay varias capturas del mismo partido, la evaluación usa la
más reciente antes del inicio y marca las anteriores como `superseded`.

Cuando el partido termina (+3 h), el paso `evaluate` busca el resultado en
`HistoricalMatch` (CSV oficial o API provisional) y, como respaldo, en
`BetLeg` con marcador. Calcula Brier y log-loss de mercado y modelo y los guarda
en el snapshot. El panel **Precisión del modelo** muestra una sección separada
**“Desde que está en uso”** con N, Brier de modelo vs. mercado y desglose por
liga. Si N < 30 se muestra una advertencia de muestra pequeña.

Comando de revisión:

```bash
npm run analysis:review
```

Evalúa pendientes, compara el forward test con el backtest de
`analysis-weights.json` y avisa si el modelo se deteriora o si el peso óptimo
del modelo respecto al mercado deja de ser 0. **No modifica parámetros ni
pesos**; solo reporta y recomienda.

## Fuentes de resultados para ratings

| Fuente | ¿Alimenta ratings? | Detalle |
| --- | --- | --- |
| CSV oficial football-data.co.uk | **Sí** | Importación manual; `HistoricalMatch` con `provisional=false`. |
| API football-data.org / TheSportsDB | **Sí, provisional** | El paso `results` guarda `HistoricalMatch` con `source='api'` y `provisional=true`; el CSV oficial lo reemplaza. |
| BetLeg (resultados de usuarios) | **No** | Solo se usa como respaldo para evaluar snapshots forward, nunca para entrenar. |
| `UpcomingFixture` de APIs | **No** | Solo calendario/análisis; el resultado entra por `results` cuando termina. |

Todos los ratings salen de `HistoricalMatch`. En las 7 ligas objetivo (E0, SP1,
I1, D1, F1, BRA, ARG) hay CSV histórico. Liga 1 (PER1) no tiene CSV y, por
tanto, no genera ratings; sus resultados de API no crean un modelo. Los
resultados de usuarios nunca entrenan el modelo.

## Campeón y retador

Las versiones del modelo se guardan en `ModelVersion` con estado `CHAMPION`,
`CHALLENGER` o `RETIRED`, parámetros, métricas, fecha y notas. El comando
mensual:

```bash
npm run analysis:tune
```

hace una búsqueda acotada sobre decaimiento (180–730 días), regularización,
tratamiento de la ventaja de local y temperatura, con validación walk-forward
sobre los resultados disponibles (CSV y API provisional). Crea un **retador**;
no modifica el campeón ni `analysis-weights.json`.

El retador predice **en sombra** en cada `analysis:generate`; sus probabilidades
se guardan en `AnalysisSnapshot.challengerProbability` y **no se muestran** en
`/analysis`. La evaluación forward calcula también su Brier/log-loss.

Regla de promoción (configurable por entorno):

- Muestra forward agrupada ≥ 300 partidos.
- Mejora relativa de Brier ≥ 0.5 %.
- Intervalo bootstrap pareado del 95 % que excluya 0.
- Log-loss no peor que el campeón.

Por defecto la promoción es **manual**: `/settings` muestra campeón, retador,
métricas, N forward, mejora, IC y motivos. El botón “Promover” solo se habilita
si se cumple la regla. También hay “Volver a esta versión” para rollback. Cada
cambio guarda métricas antes/después en el `ModelVersion` y actualiza el campeón
usado por los siguientes análisis.

El peso modelo/mercado se reestima con la misma regla en cada tuning; sigue en
0 salvo mejora significativa sostenida. Las variantes con tiros/córneres son
opcionales y no se activan sin pasar por el mismo proceso.

### Tuning rápido y tuning completo

`ANALYSIS_TUNE_QUICK=1` existe solo para smoke tests. La versión se guarda con
`ModelVersion.quick=true`, muestra el badge **Quick · no promovible** en
`/settings` y **nunca** puede promoverse, aunque las métricas parezcan buenas.

Tuning completo (mensual):

```bash
# Asegúrate de NO tener ANALYSIS_TUNE_QUICK=1
docker exec -it <contenedor> env -u ANALYSIS_TUNE_QUICK npm run analysis:tune
```

- Rejilla por defecto: decaimiento 180/365/730, ridge 40/70/120, ventaja de
  local `fit|league`, temperatura 0.7/1.0.
- Validación walk-forward con 2 folds por liga.
- Presupuesto por defecto `ANALYSIS_TUNE_BUDGET_MS=900000` (15 min). El proceso
  puede tardar **10–15 minutos**; si el presupuesto se agota, usa el mejor
  candidato encontrado y lo reporta.
- Crea un `CHALLENGER` con `quick=false` y retira el retador anterior (no lo
  borra).
- No modifica el campeón, `analysis-weights.json` ni el peso 0.

Para reemplazar el retador quick actual:

1. Ejecuta el tuning completo sin `ANALYSIS_TUNE_QUICK`.
2. El comando pasa el quick a `RETIRED` y crea un retador nuevo con otro `id`.
3. Ejecuta `npm run analysis:refresh` o espera la siguiente corrida para que
   `analysis:generate` llene las predicciones en sombra del retador nuevo.
4. Los snapshots del campeón y del retador anterior **no se borran**. Los
   snapshots guardan `challengerVersionId`; los del quick quedan como auditoría
   y no se usan para la promoción del retador nuevo.
5. La promoción del retador nuevo sigue siendo manual y requiere
   `ANALYSIS_ADMIN_EMAIL`.

### Permisos de promoción

Sin `ANALYSIS_ADMIN_EMAIL` definido, **promoción y rollback están
deshabilitados** (denegar por defecto). `/settings` muestra el aviso y no ofrece
botones activos. Si se define, solo ese email puede aprobar; el resto de
usuarios puede ver las métricas pero no cambiar de versión.

## Conclusión de esta fase

El mercado de cierre sigue siendo **mejor que el modelo en todas las ligas** y
la mezcla validada no lo mejora. Por tanto, en `/analysis`:

- El mercado es la fuente principal cuando hay cuotas frescas; la probabilidad
  final es la del mercado.
- El modelo es una **fuente secundaria e independiente**, con peso 0 en la
  probabilidad final. Se muestra aparte, con su backtest y su nota fija.
- Si no hay mercado, la probabilidad final es la del modelo, con confianza
  Media/Baja y la nota: “En pruebas, el mercado superó a este modelo en todas
  las ligas”.
- Si una liga no tiene backtest contra mercado, se usa la línea base ingenua
  como referencia y se dice explícitamente.
- La comunidad y el historial propio nunca se mezclan en la probabilidad final;
  se muestran como fuentes separadas y la comunidad exige ≥5 usuarios distintos
  con opt-in anónimo.
- Si el mercado y el modelo discrepan mucho, se muestra la discrepancia, no se
  inventa un consenso.

## Uso en la app

`/analysis` muestra 1X2, Over/Under 2.5 y ambos marcan del modelo. La cuota que
escribe el usuario se compara con la cuota justa del mercado
(`1 / probabilidad sin margen`); el texto es una comparación neutra, no una
recomendación. Tocar un mercado de la tarjeta o del detalle precarga mercado,
línea y selección en `/bets/new`, nunca la cuota.

### Historial de partidos jugados

`/analysis/historial` busca solo partidos ya terminados (`HistoricalMatch`):

- **Equipo:** se resuelve contra `Team.normalizedName` y `TeamAlias`, así que
  “Man Utd” y “Manchester United” devuelven lo mismo. No hay coincidencia
  difusa: si el nombre no resuelve a un equipo, la pantalla lo dice.
- **Filtros:** competiciones múltiples, rango de fechas inclusivo en la zona del
  usuario, captura guardada/reconstruida y paginación de 20.
- **Guardada** significa que existe una `AnalysisSnapshot` anterior al inicio;
  si no, el partido se marca **Reconstruida** y el detalle se calcula con los
  ratings de esa semana (no es la predicción que se mostró en su momento).
- **Mis partidos** cruza los `BetLeg` del usuario por nombre normalizado con
  alias y una tolerancia de ±36 h.
- Los resultados provisionales de la API se marcan como tales; el CSV oficial
  los reemplaza.

La operación automática (import → sync → recálculo, lock, estado y cron) está en
[`docs/analysis-ops.md`](./analysis-ops.md).

### Predicción guardada vs reconstrucción

El detalle de un partido (`/analysis/historial/[id]`) tiene dos modos:

- **Predicción guardada**: usa la `AnalysisSnapshot` más reciente anterior al
  inicio. Es lo que se mostró en su momento y no se recalcula. Incluye mercado,
  modelo, final mostrada, mercados ampliados, top-5 de marcadores y comunidad,
  si la captura los guardó.
- **Reconstrucción retrospectiva**: se recalcula con los ratings as-of de la
  semana del partido (solo partidos anteriores, sin la misma semana) y las
  cuotas guardadas del partido. Los parámetros del campeón son actuales e
  incluyen ese periodo, así que es una aproximación, no la predicción que se
  mostró. La comunidad **no** se reconstruye.

Los snapshots anteriores a la ampliación no tienen `markets`, `topScores` ni
comunidad: el detalle muestra lo disponible y “No guardado” en lo que falta.
Las ligas extra solo tienen cuota de cierre, así que el mercado pre-cierre no
aparece. Un partido sin histórico (Liga 1, copas internacionales) muestra “Sin
análisis disponible” en vez de inventar cifras.

La puntuación del partido (Brier y log-loss por fuente) es informativa: un solo
partido no permite concluir nada sobre la calidad del modelo.

## Limitaciones conocidas

- Equipos recién ascendidos arrancan en la media de la liga: el modelo no conoce
  su nivel hasta que acumulan partidos.
- No usa lesiones, alineaciones, descanso, viajes, xG ni estadísticas de partido.
- Las ligas anuales (Brasil, Argentina) tienen dinámicas distintas; Argentina es
  la que peor calibra y debe llevar confianza más baja.
- El modelo no se reajusta intra-semana: el reajuste de ratings corre como
  máximo una vez por semana. Los análisis se recalculan más seguido usando los
  ratings guardados.
- La corrección Dixon-Coles es un parche para marcadores bajos, no un modelo
  bivariado completo.

## Reproducir

```bash
npm run analysis:backtest
npm run analysis:review
npm run analysis:tune
```

Genera `analysis-weights.json` y actualiza `ModelEvaluation` con métricas de
cierre, pre-cierre, calibración y mezcla. `analysis:review` evalúa el forward
test. `analysis:tune` crea un retador; no cambia el campeón ni los pesos.
Parámetros opcionales:

```bash
ANALYSIS_HALF_LIFE=365 ANALYSIS_RIDGE=70 npm run analysis:backtest
```
