# WinLoss — Bankroll Tracker

Aplicación web **mobile-first** para gestionar el bankroll, registrar apuestas
deportivas y medir la rentabilidad real (ROI, yield, win rate y evolución del
capital).

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| Lenguaje | TypeScript strict |
| Estilos | Tailwind CSS v4 |
| Componentes | shadcn/ui (Radix) |
| Base de datos | PostgreSQL + Prisma 6 |
| Autenticación | Auth.js v5 (Credentials + Prisma adapter) |
| Validación | Zod 4 |
| Dinero | decimal.js (sin errores de coma flotante) |

## Puesta en marcha

```bash
npm install
cp .env.example .env   # y rellena DATABASE_URL + AUTH_SECRET
npm run db:migrate     # crea las tablas
npm run dev
```

La app queda en <http://localhost:3000>.

### Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL |
| `AUTH_SECRET` | Sí | Secreto de Auth.js (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | Sí | `true` en local / self-hosting |

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm run db:generate` | Genera Prisma Client |
| `npm run db:migrate` | Migraciones en desarrollo |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Datos de ejemplo (pendiente) |
| `npm run test:e2e` | Smoke test E2E (requiere Chrome y `npm run dev`) |

## Estructura

```
prisma/
  schema.prisma          # User/Auth.js + Bankroll, Bookmaker, Bet
  migrations/            # Migración inicial aplicada
scripts/
  smoke.mjs              # E2E: registro → bankroll → casa → apuesta → liquidación → logout
src/
  app/
    (app)/               # Shell autenticado (dashboard, apuestas, bankroll, ajustes)
    (auth)/              # Login y registro
    api/auth/            # Route handler de Auth.js
    layout.tsx           # Layout raíz, fuentes, metadata y toaster
    manifest.ts          # Manifest PWA
  auth.ts                # Configuración de Auth.js (Credentials + Prisma)
  components/
    auth/                # Formularios de login/registro
    bankroll/            # Tarjeta y sheet de creación/edición
    bets/                # Formulario, tarjeta y liquidación de apuestas
    bookmakers/          # CRUD de casas de apuestas
    layout/              # Sidebar desktop + bottom nav móvil + shell
    ui/                  # Componentes shadcn/ui
  lib/
    actions/             # Server Actions (auth, bankroll, casas y apuestas)
    data/                # Consultas de lectura (DAL)
    bet-math.ts          # Cálculo de payout, profit, ROI, yield, win rate
    bet-status.ts        # Etiquetas y colores de estado
    date.ts              # Fechas para datetime-local por zona horaria
    format.ts            # Formato es-PE / PEN
    prisma.ts            # Singleton de Prisma
    validations/         # Esquemas Zod
```

## Decisiones de producto

- **Mobile-first real**: todo se diseña a 360–390 px. El sidebar solo aparece
  en `md+`; en móvil la navegación es una barra inferior con FAB central.
- **Touch targets ≥ 44 px**: botones, inputs y navegación usan `h-11`/`h-12`.
- **Decimales**: las cuotas y el dinero se guardan como `Decimal` en PostgreSQL
  y se operan con `decimal.js`.
- **Free bets**: el stake no se descuenta ni se devuelve; solo cuenta el
  beneficio.
- **Cache Components desactivado** por ahora: la app es 100 % autenticada y no
  se beneficia de prerenderizar un shell estático.

## Estado

- [x] Fase 0 — Scaffold, sistema de diseño, modelo de datos y shell de navegación
- [x] Fase 1 — Auth.js (registro/login con credenciales) + rutas protegidas
- [x] Fase 2 — CRUD de bankrolls (crear, editar, borrar, métricas por bankroll)
- [x] Fase 3 — Casas de apuestas, alta de apuestas y liquidación
- [ ] Fase 4 — Dashboard con métricas y curva de bankroll
- [ ] Fase 5 — Historial, filtros y edición
- [ ] Fase 6 — PWA, export CSV y pulido UX

## Seguridad (pendiente de hardening)

- Rate limiting en login/registro.
- Verificación de email y recuperación de contraseña.
- CSRF ya cubierto por Auth.js; Server Actions validan sesión y ownership.
- `AUTH_SECRET` y `DATABASE_URL` viven solo en `.env` (ignorado por git).
