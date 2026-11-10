# Backlog UI de /analysis

Pendientes **opcionales** detectados al ajustar la densidad del tablero. No
forman parte de las fases 2–5 de la revisión histórica y no se implementan sin
pedirlo.

## 1. Objetivos táctiles de 44 × 44 px

Hecho: chips de filtros, "Registrar apuesta", celdas 1X2, chips de mercados,
"Ver", pestañas y acciones de cabecera miden al menos 44 px. La tarjeta pasó a
`h-[220px]` para que el contenido siga cabiendo sin desbordar.

## 2. Altura mínima con truncado en vez de altura fija

La tarjeta usa `h-[220px]`. Probar `min-h` + `line-clamp` en equipos y
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
