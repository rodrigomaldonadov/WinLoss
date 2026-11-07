# Datos de análisis

## Carpeta oficial

Los CSV se leen **solo desde el servidor** en `./data-football` (configurable con
`ANALYSIS_DATA_DIR`). La carpeta está en `.gitignore` y `.dockerignore`: no se
commitea, no se sirve al cliente, no se incluye en la imagen y no se
redistribuye.

En Dokploy/VPS debe montarse como **volumen persistente**. El comando de
importación se ejecuta allí, nunca desde una petición de usuario.

## Actualización manual

1. Descarga los CSV desde football-data.co.uk **manualmente**.
2. Copia los archivos de resultados conservando la estructura:
   - `england/25-26/E0.csv`, `spain/25-26/SP1.csv`, etc.
   - `argentina/ARG.csv`, `brazil/BRA.csv`, etc.
3. Copia el archivo semanal de próximos partidos en `data-football/fixtures/`.
4. Ejecuta:

```bash
npm run analysis:import
```

Frecuencia recomendada: **lunes y jueves**, después de actualizar los archivos.
En la web de origen las cuotas de fin de semana suelen llegar los viernes y las
de entre semana los martes.

No hay cron, scraping ni `fetch` a football-data.co.uk en runtime ni en CI.

## Ligas y temporadas

- Inglaterra: Premier League, Championship, League One, League Two y National
  League.
- España: LaLiga y LaLiga 2.
- Italia: Serie A y Serie B.
- Alemania: Bundesliga y 2. Bundesliga.
- Francia: Ligue 1 y Ligue 2.
- Bélgica, Países Bajos, Portugal, Turquía, Grecia y Escocia (sus divisiones).
- Extras anuales: Argentina, Brasil, Austria, Dinamarca, Finlandia, Irlanda,
  México, Noruega, Polonia, Rumanía, Suecia, Suiza y MLS.

El filtro `ANALYSIS_MIN_SEASON_START = 2022-07-01` descarta filas anteriores. En
las ligas anuales se filtra por fecha, no por el texto de temporada.

**Liga 1 de Perú no está en esta fuente.** Se analizará con TheSportsDB y datos
propios, con confianza baja.

## Formatos tolerados

- Separador coma o punto y coma.
- UTF-8, UTF-8 con BOM y Windows-1252/Latin-1.
- Fechas `dd/mm/yy` y `dd/mm/yyyy`.
- Líneas vacías, columnas extra al final y cuotas vacías.
- Los archivos principales usan `Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,...`.
- Las extra leagues usan `Country,League,Season,Date,Home,Away,HG,AG,...` y **solo
  cuotas de cierre**.
- El archivo de fixtures se detecta por la carpeta `fixtures/` o por no tener
  columnas de marcador. Se guarda como lote de próximos partidos y sustituye al
  lote anterior.

## Cuotas

- Mercado: promedio `Avg*` (y `AvgC*` para cierre). No se da peso especial a
  Pinnacle (`PSC*`), porque desde el 23/07/2025 sus cuotas no están al día.
- Las extra leagues solo aportan cierre: se usan para entrenar/evaluar, no como
  cuotas de partidos futuros.
- Las cuotas de fixtures con más de **4 días** de antigüedad se descartan y la
  fuente Mercado se oculta.

## Alias de equipos

`team-aliases.json` es la fuente **explícita** de nombres. Clave: nombre
normalizado (minúsculas, sin acentos, sin `FC/CF/SC/...`). Valor: nombre
canónico.

El importer **no resuelve nombres desconocidos**: solo aplica lo que ya existe
en `team-aliases.json` y guarda en `TeamAlias` los nombres resueltos para
trazabilidad. Para ver nombres sin resolver y sugerencias difusas:

```bash
npm run analysis:aliases
```

Un partido próximo con un equipo sin alias aparece como “sin datos
suficientes”; no se inventa una predicción.

## Estadísticas de partido

Se importan tiros, tiros a puerta, córneres, tarjetas y xG cuando existen. En
esta fase **no se usan** para el modelo; quedan disponibles para una mejora
informativa de totales.

## Licencia

football-data.co.uk permite el uso **privado** y excluye productos comerciales
o entrenamiento de datos con bots, scrapers o IA automatizados. No descargues
los archivos automáticamente. Si la app se abre a terceros, pide permiso al
autor o migra a una API con licencia.

## Modelo

Metodología, hiperparámetros y resultados del backtest:
[`docs/analysis-model.md`](./analysis-model.md).
