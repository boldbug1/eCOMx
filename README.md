# eCOMx

A REST API for a multi-user ecommerce backend — customer orders linked to authenticated users, a manager-administered product catalog, role-based access control, oversell-proof transactional ordering, Redis-backed caching, and rate limiting. Built with **Express**, **TypeScript**, **Prisma ORM 7**, **Zod**, and **Redis**.

## Tech Stack

| Layer          | Tech                                                             |
| -------------- | ---------------------------------------------------------------- |
| Runtime        | Node.js (v24)                                                    |
| Language       | TypeScript (strict)                                              |
| Framework      | Express (v5)                                                     |
| ORM            | Prisma (v7.9.1) with driver adapter (`@prisma/adapter-pg` + `pg`) |
| Validation     | Zod 4                                                            |
| Auth           | JWT (`jsonwebtoken`) + bcrypt password hashing                   |
| Database       | PostgreSQL (local, port 5432)                                    |
| Cache          | Redis (`ioredis`) — product cache + rate-limit store             |
| Security       | `helmet`, CORS whitelist, rate limiting (`express-rate-limit` + `rate-limit-redis`) |
| Dev runner     | `tsx watch`                                                      |
| Testing        | Vitest + Supertest                                               |

## Project Structure

```
├── prisma/
│   ├── schema.prisma        # Prisma schema (User / Order / OrderItem / Product / Cart / CartItem)
│   └── migrations/          # Prisma migrations
├── prisma.config.ts         # Prisma CLI config (schema path + datasource URL)
├── src/
│   ├── app.ts               # Express app wiring (helmet, CORS, rate limit, routes)
│   ├── server.ts            # Bootstrap: imports app and listens on PORT
│   ├── routes/
│   │   ├── authRoutes.ts    # /register, /login (rate-limited)
│   │   ├── orders.ts        # Order CRUD (owner-scoped, ADMIN overview)
│   │   ├── products.ts      # Catalog (public read, guarded writes, Redis-cached)
│   │   └── cart.ts          # Per-user cart CRUD
│   ├── middleware/
│   │   ├── requireAuth.ts   # JWT verification -> req.user { id, role }
│   │   ├── requirePermission.ts # RBAC guard against the permission matrix
│   │   ├── rateLimiter.ts   # App-wide + auth-specific limiters (Redis or in-memory fallback)
│   │   ├── errorHandler.ts  # 404 + central error middleware
│   │   └── logger.ts        # Request logging
│   ├── permissions.ts       # PERMISSIONS + ROLE_PERMISSIONS matrix
│   ├── services/
│   │   ├── auth.ts          # signToken() helper
│   │   ├── redis.ts         # Shared ioredis client
│   │   └── productCache.ts  # get/set/invalidate product cache helpers
│   ├── types/               # Zod schemas (order, product, auth, cart)
│   ├── db/prisma.ts         # PrismaClient with PrismaPg driver adapter
├── tests/orders.test.ts     # 42 e2e tests (auth, RBAC, ownership, stock, catalog)
├── .env / .env.example      # DATABASE_URL, JWT_SECRET, REDIS_URL, PORT
└── package.json
```

## Prerequisites

- PostgreSQL running locally on port `5432`
- A database user plus a database (e.g. `amazon_db`)
- Redis running locally on port `6379` (or set `REDIS_URL`)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the environment in `.env` (see `.env.example`):

   ```
   PORT=3000
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/amazon_db?schema=public"
   JWT_SECRET="<long random string>"
   REDIS_URL="redis://localhost:6379"
   ```

   > Use a URL-encoded password (special characters such as `&` must be `%26`).

3. Run migrations and generate the client:

   ```bash
   npx prisma migrate dev   # applies migrations AND regenerates the client
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

The server listens on `PORT` (default `3000`).

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the dev server with `tsx watch`        |
| `npm run build`    | Compile TypeScript (`tsc`)                   |
| `npm run test`     | Run the Vitest suite (42 tests)              |
| `npm run start`    | Run the compiled output (`node dist/server.js`) |
| `npx prisma migrate dev` | Create / apply migrations               |
| `npx prisma generate`   | Regenerate the Prisma Client            |

> Note: the test suite writes to the same database as `dev`; it cleans up after itself (orders, products, users). Don't run it against a database with data you care about.

## Auth Flow

- `POST /api/v1/register` — creates a user (bcrypt-hashed password, `role: USER` by default) and returns 201 with a JWT.
- `POST /api/v1/login` — verifies credentials, returns a JWT. **All subsequent requests send it as** `Authorization: Bearer <token>`.
- The JWT carries `{ sub: user.id, role: user.role }`; `requireAuth` restores `req.user` from it — the token is the only trusted source of identity (never the request body).
- Both endpoints are rate-limited to **5 requests / 15 min** per IP.

### Roles & Permissions

| Action                    | USER | MODERATOR | ADMIN |
| ------------------------- | ---- | --------- | ----- |
| Browse catalog (GET products) | ✓ (public, no token) | ✓ | ✓ |
| Create / update orders    | ✓    | ✓         | ✓     |
| Delete orders             | ✗    | ✗         | ✓     |
| Create / update products  | ✗    | ✓         | ✓     |
| Delete products           | ✗    | ✗         | ✓     |

The matrix lives in `src/permissions.ts` and is enforced by `requirePermission`, which returns **403** when the caller's role lacks a required permission (after **401** when no/invalid token).

## API Endpoints

Base path: `/api/v1`. App-wide rate limit: **100 requests / 15 min** per IP.

| Method | Endpoint | Auth | Description |
| ------ | -------- | ---- | ----------- |
| GET    | `/`      | —    | Health check (`{ health: "ok" }`) |

### Auth

| Method | Endpoint    | Auth | Description |
| ------ | ----------- | ---- | ----------- |
| POST   | `/register` | —    | Register a user, returns JWT (5/15 min limit) |
| POST   | `/login`    | —    | Login, returns JWT (5/15 min limit) |

### Orders (owner-scoped: every query is filtered by the authenticated user)

| Method | Endpoint         | Auth | Description |
| ------ | ---------------- | ---- | ----------- |
| POST   | `/orders`        | ✓    | Create an order (transactional, snapshot price, decrement stock) |
| GET    | `/orders`        | ✓    | List **own** orders (ADMIN sees all) |
| GET    | `/orders/:id`    | ✓    | Get a single order (404 for other users' ids; ADMIN bypasses) |
| PATCH  | `/orders/:id`    | ✓    | Partial update — status, or full item replacement (pending orders only) |
| DELETE | `/orders/:id`    | ✓    | Delete/cancel a **pending** order; restores stock (ADMIN) |

### Products (public read, guarded writes, Redis-cached reads)

| Method | Endpoint          | Auth | Description |
| ------ | ----------------- | ---- | ----------- |
| GET    | `/products`       | —    | Public catalog |
| GET    | `/products/:id`   | —    | Public product detail (Redis cache, 1 h TTL) |
| POST   | `/products`       | ✓    | Create product (MODERATOR+) |
| PATCH  | `/products/:id`   | ✓    | Update product (MODERATOR+); invalidates cache |
| DELETE | `/products/:id`   | ✓    | Delete product if it has no order history (ADMIN) |

### Cart (owner-scoped)

| Method | Endpoint              | Auth | Description |
| ------ | --------------------- | ---- | ----------- |
| GET    | `/cart`               | ✓    | Get own cart (auto-creates it on first visit) |
| POST   | `/cart/items`         | ✓    | Add item — merges quantity if it already exists |
| PATCH  | `/cart/items/:itemId` | ✓    | Update quantity (403 for other users' items) |
| DELETE | `/cart/items/:itemId` | ✓    | Remove an item (403 for other users' items) |
| DELETE | `/cart`               | ✓    | Clear the cart |

Adding an item requires `{ "productId": "<uuid>", "quantity": 1..100 }`; quantity on update is also `1..100`. Carts are per-user (one `Cart` per `User`).

### Create Order — `POST /api/v1/orders`

Price and total are **never taken from the client** — they're snapshotted from the products table inside a database transaction that also validates stock and decrements it atomically (no overselling).

```json
{
  "customerName": "Jane Doe",
  "items": [
    { "productId": "uuid-of-product", "quantity": 2 }
  ]
}
```

`status` is optional and defaults to `"pending"` (`"pending" | "processing" | "completed"`).

### Create Product — `POST /api/v1/products` (MODERATOR/ADMIN)

```json
{
  "name": "Wireless Mouse",
  "description": "Ergonomic, 2.4 GHz",
  "price": 24.99,
  "stock": 50
}
```

`createdById` is stamped from the token — clients cannot set who created a product.

## Data Model

### User

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `email` | String | Unique |
| `password` | String | bcrypt hash |
| `role` | Role | `USER` default |
| `orders` | Order[] | One-to-many |
| `createdProds` | Product[] | Products the user created |
| `cart` | Cart? | One-to-one |

### Product

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `name`, `description` | String | |
| `price` | Float | Authoritative price (snapshotted into orders) |
| `stock` | Int | Decremented atomically on each purchase |
| `createdById` | String | FK → User.id |
| `orderItems` | OrderItem[] | One-to-many |
| `cart` | CartItem[] | Cart references |

### Order

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `customerName` | String | |
| `totalAmount` | Float | Computed server-side from product prices |
| `status` | String | Defaults to `"pending"` |
| `userId` | String | FK → User.id (ownership scoping) |
| `items` | OrderItem[] | Cascade delete |

### OrderItem

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `productId` | String | FK → Product.id, `onDelete: Restrict` (products with history can't be deleted) |
| `quantity` | Int | |
| `price` | Float | Price snapshot **at purchase time** |
| `orderId` | String | FK → Order.id, cascade delete |

### Cart

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `userId` | String | Unique FK → User.id, cascade delete |
| `items` | CartItem[] | |

### CartItem

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `cartId` | String | FK → Cart.id, cascade delete |
| `productId` | String | FK → Product.id, cascade delete |
| `quantity` | Int | Unique per `[cartId, productId]` |

## Caching & Rate Limiting

- **Product cache:** `GET /products/:id` reads from Redis (`product:<id>`, 1 h TTL) on cache hit; on miss it queries Postgres and warms the cache. The cache is invalidated whenever stock changes — order create/update/delete and product update/delete — so prices and stock are never stale for long.
- **Rate limiting:** a global 100 req / 15 min limiter and a stricter 5 req / 15 min limiter on auth routes. Both use a Redis store (`rate-limit-redis`) and return 429 when exhausted. **Fail-open:** at boot the server pings Redis; if it's unreachable the limiters fall back to in-memory stores (and the product cache degrades to direct DB queries), so a Redis outage never takes the API down.

## Run with Docker (recommended)

PostgreSQL, Redis, and the API all run via `docker compose` — no local setup needed:

```bash
docker compose up --build
```

Migrations are applied automatically on startup (`npx prisma migrate deploy`), then the server listens on `http://localhost:3000` (health check: `GET /`).

- Change the default `JWT_SECRET` in `docker-compose.yml` before exposing the API.
- Ports 5432 (Postgres) and 6379 (Redis) are published so you can connect with local tools; remove the `ports:` entries to keep them private.
- The Postgres data persists in the `pgdata` volume; `docker compose down -v` wipes it.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on PRs: `npm ci` → `prisma generate` → `migrate deploy` → `npm run build` → `npm test`, with Postgres and Redis spun up as GitHub Actions service containers.

## Known Setup Notes / Troubleshooting

## Security Properties

- **Owner scoping:** every order query filters by `userId: req.user.id` — guessing another user's UUID returns 404, never their data. (ADMIN has a read-only overview.)
- **Prices from the DB:** clients cannot set or forge prices; the server snapshots `Product.price` in the same transaction that creates the order.
- **No overselling:** stock checks and decrements happen atomically (`updateMany` with a `stock >= qty` guard) inside `prisma.$transaction`.
- **Stock restored on cancel/edit:** deleting an order (or replacing its items) only works while `status` is `pending`, and stock is returned to the products.
- **FK integrity:** you physically can't order a product that doesn't exist; products with sales history can't be deleted (only stock-set-to-0).
- **Transport hardening:** `helmet` sets secure HTTP headers; CORS is restricted to a whitelist (`http://localhost:3000`).
- **Cache invalidation:** every stock-mutating path invalidates the affected Redis keys.

## Known Setup Notes / Troubleshooting

- **Prisma CLI config**: Environment variables are NOT auto-loaded by the Prisma CLI in v7. `prisma.config.ts` loads them via `import "dotenv/config"` and exposes `DATABASE_URL` through `env("DATABASE_URL")`.
- **PostgreSQL authentication**: Prisma connects to Postgres via TCP using password auth. If `pg_hba.conf` requires `ident`/`peer` for local connections instead of password authentication, Prisma fails when connecting through `localhost`. This project's database was configured to use `scram-sha-256` password auth for the connection to work with Prisma.
- **Special characters in passwords**: Any reserved URL character in the database password (e.g. `&`, `#`, `@`) must be percent-encoded in `DATABASE_URL`.
- **Redis**: the server expects a Redis instance at `REDIS_URL` (default `redis://localhost:6379`) for caching and rate limiting.
- **Driver adapter**: The Prisma Client is instantiated with the `PrismaPg` driver adapter backed by a `pg` `Pool` (see `src/db/prisma.ts`), so `pg` and `@prisma/adapter-pg` are required at runtime.
