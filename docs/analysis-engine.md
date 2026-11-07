# Motor de análisis

## Flujo manual

```bash
# 1. Históricos desde CSV locales (solo servidor)
npm run analysis:import

# 2. Próximos partidos desde TheSportsDB / football-data.org
npm run analysis:sync

# 3. Ratings, análisis persistidos y comunidad
npm run analysis:generate

# 4. Backtest, calibración y pesos
npm run analysis:backtest
```

No hay cron ni scraping. `analysis:sync` y `analysis:generate` se ejecutan a
mano después de actualizar los datos.

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

- `GET /api/analysis?dias=7`: feed autenticado con comunidad y privado al vuelo.
- `GET /api/analysis/model`: números del panel “Precisión del modelo”.

La capa de datos está en `src/lib/data/analysis.ts`. La UI se implementa en la
Fase 5.

## Limitaciones

- El mercado de APIs no está disponible; las cuotas siguen viniendo del CSV.
- El modelo se ajusta una vez por ejecución de `analysis:generate`, no en cada
  petición.
- Los equipos recién ascendidos arrancan en la media de su liga.
- La comunidad depende de que los picks tengan un `eventName` reconocible y una
  fecha cercana al partido.
