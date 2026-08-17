# eCOMx

A REST API for a multi-user ecommerce backend customer orders linked to authenticated users, a manager-administered product catalog, role-based access control, and oversell-proof transactional ordering. Built with **Express**, **TypeScript**, **Prisma ORM 7**, and **Zod**.

## Tech Stack

| Layer          | Tech                                                             |
| -------------- | ---------------------------------------------------------------- |
| Runtime        | Node.js (v24.18.1)                                               |
| Language       | TypeScript (strict)                                              |
| Framework      | Express (v5)                                                     |
| ORM            | Prisma (v7.9.1) with driver adapter (`@prisma/adapter-pg` + `pg`) |
| Validation     | Zod 4                                                           |
| Auth           | JWT (`jsonwebtoken`) + bcrypt password hashing                   |
| Database       | PostgreSQL (local, port 5432)                                   |
| Dev runner     | `tsx watch`                     |
| Testing        | Vitest + Supertest              |

## Project Structure

```
├── prisma/
│   ├── schema.prisma        # Prisma schema (User / Order / OrderItem / Product)
│   └── migrations/          # Prisma migrations
├── prisma.config.ts         # Prisma CLI config (schema path + datasource URL)
├── src/
│   ├── app.ts               # Express app wiring (importable by tests)
│   ├── server.ts            # Bootstrap: imports app and listens on PORT
│   ├── routes/
│   │   ├── authRoutes.ts    # /register, /login
│   │   ├── orders.ts        # Order CRUD (owner-scoped)
│   │   └── products.ts      # Catalog (public read, guarded writes)
│   ├── middleware/
│   │   ├── requireAuth.ts   # JWT verification -> req.user { id, role }
│   │   ├── requirePermission.ts # RBAC guard against the permission matrix
│   │   └── logger.ts        # Request logging
│   ├── permissions.ts       # PERMISSIONS + ROLE_PERMISSIONS matrix
│   ├── services/auth.ts     # signToken() helper
│   ├── types/               # Zod schemas (order, product, auth)
│   ├── db/prisma.ts         # PrismaClient with PrismaPg driver adapter
├── tests/orders.test.ts     # 47 e2e tests (auth, RBAC, ownership, stock)
├── .env                     # Environment variables (DATABASE_URL, JWT_SECRET)
└── package.json
```

## Prerequisites

- PostgreSQL running locally on port `5432`
- A database user plus a database (e.g. `amazon_db`)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the environment in `.env`:

   ```
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/amazon_db?schema=public"
   JWT_SECRET="<long random string>"
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
| `npm run test`     | Run the Vitest suite (47 tests)              |
| `npm run start`    | Run the compiled output (`node dist/server.js`) |
| `npx prisma migrate dev` | Create / apply migrations               |
| `npx prisma generate`   | Regenerate the Prisma Client            |

> Note: the test suite writes to the same database as `dev`; it cleans up after itself (orders, products, users). Don't run it against a database with data you care about.

## Auth Flow

- `POST /api/v1/register` — creates a user (bcrypt-hashed password, `role: USER` by default) and returns 201.
- `POST /api/v1/login` — verifies credentials, returns a JWT. **All subsequent requests send it as** `Authorization: Bearer <token>`.
- The JWT carries `{ sub: user.id, role: user.role }`; `requireAuth` restores `req.user` from it — the token is the only trusted source of identity (never the request body).

### Roles & Permissions

| Action                    | USER | MODERATOR | ADMIN |
| ------------------------- | ---- | --------- | ----- |
| Browse catalog (GET products) | ✓ (public, no token) | ✓ | ✓ |
| Create / update orders    | ✓    | ✓         | ✓     |
| Delete orders             | ✗    | ✓         | ✓     |
| Create / update products  | ✗    | ✓         | ✓     |
| Delete products           | ✗    | ✗         | ✓     |

The matrix lives in `src/permissions.ts` and is enforced by `requirePermission`, which returns **403** when the caller's role lacks a required permission (after **401** when no/invalid token).

## API Endpoints

Base path: `/api/v1`

### Auth

| Method | Endpoint    | Auth | Description |
| ------ | ----------- | ---- | ----------- |
| POST   | `/register` | —    | Register a user         |
| POST   | `/login`    | —    | Login, returns JWT      |

### Orders (owner-scoped: every query is filtered by the authenticated user)

| Method | Endpoint         | Auth | Description |
| ------ | ---------------- | ---- | ----------- |
| POST   | `/orders`        | ✓    | Create an order (transactional, snapshot price, decrement stock) |
| GET    | `/orders`        | ✓    | List **own** orders (includes items) |
| GET    | `/orders/:id`    | ✓    | Get a single order (404 for other users' ids) |
| PATCH  | `/orders/:id`    | ✓    | Partial update (status or full item replacement) |
| DELETE | `/orders/:id`    | ✓    | Delete an order |

### Products (public read, guarded writes)

| Method | Endpoint          | Auth | Description |
| ------ | ----------------- | ---- | ----------- |
| GET    | `/products`       | —    | Public catalog |
| GET    | `/products/:id`   | —    | Public product detail |
| POST   | `/products`       | ✓    | Create product (MODERATOR+) |
| PATCH  | `/products/:id`   | ✓    | Update product (MODERATOR+) |
| DELETE | `/products/:id`   | ✓    | Delete product if it has no order history (ADMIN) |

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

### Product

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | String | UUID, PK |
| `name`, `description` | String | |
| `price` | Float | Authoritative price (snapshotted into orders) |
| `stock` | Int | Decremented atomically on each purchase |
| `createdById` | String | FK → User.id |
| `orderItems` | OrderItem[] | One-to-many |

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

## Security Properties

- **Owner scoping:** every order query filters by `userId: req.user.id` — guessing another user's UUID returns 404, never their data.
- **Prices from the DB:** clients cannot set or forge prices; the server snapshots `Product.price` in the same transaction that creates the order.
- **No overselling:** stock checks and decrements happen atomically (`updateMany` with a `stock >= qty` guard) inside `prisma.$transaction`.
- **FK integrity:** you physically can't order a product that doesn't exist; products with sales history can't be deleted (only stock-set-to-0).

## Known Setup Notes / Troubleshooting

- **Prisma CLI config**: Environment variables are NOT auto-loaded by the Prisma CLI in v7. `prisma.config.ts` loads them via `import "dotenv/config"` and exposes `DATABASE_URL` through `env("DATABASE_URL")`.
- **PostgreSQL authentication**: Prisma connects to Postgres via TCP using password auth. If `pg_hba.conf` requires `ident`/`peer` for local connections instead of password authentication, Prisma fails when connecting through `localhost`. This project's database was configured to use `scram-sha-256` password auth for the connection to work with Prisma.
- **Special characters in passwords**: Any reserved URL character in the database password (e.g. `&`, `#`, `@`) must be percent-encoded in `DATABASE_URL`.
- **Driver adapter**: The Prisma Client is instantiated with the `PrismaPg` driver adapter backed by a `pg` `Pool` (see `src/db/prisma.ts`), so `pg` and `@prisma/adapter-pg` are required at runtime.
