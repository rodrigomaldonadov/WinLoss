# Backlog UI de /analysis

Pendientes **opcionales** detectados al ajustar la densidad del tablero. No
forman parte de las fases 2–5 de la revisión histórica y no se implementan sin
pedirlo.

## 1. Objetivos táctiles de 44 × 44 px

- Chips de filtros rápidos (`h-8` en Próximos, `h-9` en Historial).
- Botón "Registrar apuesta" de la tarjeta (`h-7`).
- Celdas 1X2 y chips de mercados de la tarjeta.
- Botón "Ver" del aviso de estado (`h-8`).

Hoy están por debajo del mínimo recomendado. Subirlos a 44 px sin perder la
densidad actual requiere revisar el layout de la tarjeta (por ejemplo, hacer los
chips más altos solo en la zona inferior o usar un área táctil invisible con
`::before`).

## 2. Altura mínima con truncado en vez de altura fija

La tarjeta usa `h-[196px]`. Probar `min-h` + `line-clamp` en equipos y
competición, con nombres largos y con el tamaño de fuente del navegador al
200 %. Validar que no se solapen la cabecera, la grilla 1X2, los chips ni el
botón.

## 3. E2E de controles independientes

Añadir a Playwright dos comprobaciones de regresión:

- Tocar un chip de mercado (+2.5, −2.5, BTTS) abre `/bets/new`, **no** el
  detalle.
- Tocar "Registrar apuesta" abre `/bets/new`, **no** el detalle.

Cubren el patrón `pointer-events-auto` + `z-20` sobre el enlace de la tarjeta.

## 4. Capturas pendientes

- Tablero, tarjeta y detalle en modo oscuro (360 y 390 px).
- Tarjeta "Sin análisis disponible" en ambos anchos.
- Estado del aviso con hoja "Ver" abierta.
