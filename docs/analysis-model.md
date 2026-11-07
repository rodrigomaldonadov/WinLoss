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

Cada semana se reajusta con todos los partidos anteriores a esa semana, usando
el ajuste previo como arranque en caliente. Un partido nunca usa datos de la
misma semana ni posteriores.

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

Calibración 1X2 agrupada (probabilidad predicha vs frecuencia observada):

| Bin | N | Predicho | Observado |
| --- | ---: | ---: | ---: |
| 0-10% | 6 | 8,6% | 16,7% |
| 10-20% | 335 | 17,4% | 8,1% |
| 20-30% | 4.716 | 26,2% | 24,2% |
| 30-40% | 2.870 | 34,2% | 33,7% |
| 40-50% | 1.790 | 44,6% | 47,5% |
| 50-60% | 603 | 53,9% | 64,7% |
| 60-70% | 123 | 63,4% | 79,7% |
| 70-80% | 11 | 73,4% | 81,8% |
| 80-90% | 1 | 80,4% | 0,0% |

## Conclusión de esta fase

El mercado de cierre sigue siendo **mejor que el modelo en todas las ligas**.
Por tanto, en `/analysis`:

- El mercado es la fuente principal cuando hay cuotas frescas.
- El modelo es una **fuente secundaria e independiente**, nunca presentada como
  “la probabilidad correcta” ni por encima del mercado.
- La confianza del modelo debe ser menor que la del mercado; en ligas con poca
  muestra o equipos recién ascendidos, directamente baja/insuficiente.
- Si el mercado y el modelo discrepan mucho, se muestra la discrepancia, no se
  inventa un consenso.

## Limitaciones conocidas

- Equipos recién ascendidos arrancan en la media de la liga: el modelo no conoce
  su nivel hasta que acumulan partidos.
- No usa lesiones, alineaciones, descanso, viajes, xG ni estadísticas de partido.
- Las ligas anuales (Brasil, Argentina) tienen dinámicas distintas; Argentina es
  la que peor calibra y debe llevar confianza más baja.
- El modelo no se reajusta intra-semana: usa el corte del lunes.
- La corrección Dixon-Coles es un parche para marcadores bajos, no un modelo
  bivariado completo.

## Reproducir

```bash
npm run analysis:backtest
```

Parámetros opcionales:

```bash
ANALYSIS_HALF_LIFE=365 ANALYSIS_RIDGE=70 npm run analysis:backtest
```
