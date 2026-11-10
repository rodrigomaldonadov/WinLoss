# Investigación de cuotas (ParlayAPI)

`/analysis/investigar` es una sección de consulta de cuotas externas. No usa el
modelo Poisson ni las cuotas de football-data.co.uk: lee ParlayAPI en el
servidor y muestra los números tal como los publican las casas.

## Configuración

```dotenv
PARLAY_API_KEY="..."
```

La clave vive solo en el servidor (`src/lib/parlay/client.ts`). El navegador
nunca la recibe. Sin clave, la página muestra "No pudimos consultar ParlayAPI".

## Qué calcula

- **Sharp vs consenso**: probabilidades sin vig (1/cuota normalizada) por casa.
  La referencia sharp es **Novig** y, si no cotiza, **ProphetX**. El consenso es
  la mediana de las casas retail, sin vig. La diferencia se muestra en centavos
  de probabilidad (`(sharp − consenso) × 100`).
- **Mejor cuota**: máximo decimal por resultado entre todas las casas que
  cotizaron. Se cita la casa.
- **Arbitraje**: mejor cuota de cada lado para 1X2 y para cada línea de totales.
  Hay arbitraje si `1/cuota A + 1/cuota B < 1`; se muestra la suma y el margen.
- **Props**: mejor Over y Under por jugador y línea entre las casas que cotizan
  el mercado (`player_points`, `player_rebounds`, `player_assists`,
  `player_threes`).

## Cobertura real de la API (verificada)

- **Pinnacle no existe** en el catálogo de ParlayAPI: la API responde
  `UNKNOWN_BOOKMAKER`. Por eso la referencia sharp es Novig/ProphetX. La página
  lo dice explícitamente.
- **Polymarket y Kalshi** están en el catálogo, pero solo cubren contratos de
  evento y futuros; no cotizan el moneyline de un partido. La página no inventa
  una comparación.
- **Histórico**: no hay `odds-history`. El archivo es
  `/v1/historical/sports/{sport_key}/odds` y el plan actual limita a 48 h; no se
  muestra movimiento intradía.
- Si una casa no cotizó un mercado, no aparece. No se rellenan cuotas.

## Bookmakers consultados

DraftKings, FanDuel, BetMGM, Caesars, BetRivers, bet365, Bovada, Hard Rock,
Fanatics, Unibet, PMU, Novig y ProphetX. La lista está en
`src/lib/parlay/client.ts`.

