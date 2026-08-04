# Amazon API

A REST API for managing customer orders, built with **Express**, **TypeScript**, **Prisma ORM 7**, and **Zod**.

## Tech Stack

| Layer          | Tech                                     |
| -------------- | ---------------------------------------- |
| Runtime         | Node.js (v24.18.1)                       |
| Language        | TypeScript                               |
| Framework       | Express (v5)                             |
| ORM             | Prisma (v7.9.1) with driver adapter (`@prisma/adapter-pg` + `pg`) |
| Validation      | Zod (v4)                                 |
| Database        | PostgreSQL (local, port 5432)            |
| Dev runner      | `tsx watch`                              |

## Project Structure

```
├── prisma/
│   ├── schema.prisma        # Prisma schema (Order / OrderItem models)
│   └── migrations/          # Prisma migrations
├── prisma.config.ts         # Prisma CLI config (schema path + datasource URL)
├── src/
│   ├── server.ts            # Express app entry point
│   ├── routes/orders.ts     # Order REST routes
│   ├── types/order.ts       # Zod schemas + inferred types
│   ├── db/prisma.ts         # PrismaClient with PrismaPg driver adapter
│   └── middleware/logger.ts # Request logging middleware
├── .env                     # Environment variables (DATABASE_URL)
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
   # Prisma CLI loads variables from prisma.config.ts (import "dotenv/config")
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/amazon_db?schema=public"
   ```

   > Use a URL-encoded password (special characters such as `&` must be `%26`).

3. Run database migrations:

   ```bash
   npx prisma migrate dev
   ```

4. Generate the Prisma Client:

   ```bash
   npx prisma generate
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

The server listens on port `3000`.

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the dev server with `tsx watch`        |
| `npm run build`    | Compile TypeScript (`tsc`)                   |
| `npm run start`    | Run the compiled output (`node dist/server.js`) |
| `npx prisma migrate dev` | Create / apply migrations               |
| `npx prisma generate`   | Regenerate the Prisma Client            |

## API Endpoints

Base path: `/api/v1`

| Method | Endpoint         | Description                          |
| ------ | ---------------- | ------------------------------------ |
| GET    | `/`              | Health check                          |
| POST   | `/api/v1/orders` | Create an order with its items        |
| GET    | `/api/v1/orders` | List all orders (includes items)      |
| GET    | `/api/v1/orders/:id` | Get a single order by id          |
| PATCH  | `/api/v1/orders/:id` | Update an order (partial update)  |

### Create Order — `POST /api/v1/orders`

Validation is enforced with Zod (`OrderSchema` in `src/types/order.ts`).

```json
{
  "customerName": "Jane Doe",
  "totalAmount": 49.99,
  "items": [
    { "productId": "p-101", "quantity": 2, "price": 24.99 }
  ]
}
```

`status` is optional and defaults to `"pending"` (`"pending" | "processing" | "completed"`).

## Data Model

### Order

| Field        | Type     | Notes                     |
| ------------ | -------- | ------------------------- |
| `id`         | String   | UUID, primary key         |
| `customerName` | String |                           |
| `totalAmount`  | Float    |                           |
| `status`     | String   | Defaults to `"pending"`   |
| `createdAt`  | DateTime | Defaults to `now()`       |
| `updatedAt`  | DateTime | Auto-updated              |
| `items`      | OrderItem[] | One-to-many relation   |

### OrderItem

| Field       | Type   | Notes                                 |
| ----------- | ------ | ------------------------------------- |
| `id`        | String | UUID, primary key                     |
| `productId` | String |                                       |
| `quantity`  | Int    |                                       |
| `price`     | Float  |                                       |
| `orderId`   | String | Foreign key, cascade delete on Order  |

## Known Setup Notes / Troubleshooting

- **Prisma CLI config**: Environment variables are NOT auto-loaded by the Prisma CLI in v7. `prisma.config.ts` loads them via `import "dotenv/config"` and exposes `DATABASE_URL` through `env("DATABASE_URL")`.
- **PostgreSQL authentication**: Prisma connects to Postgres via TCP using password auth. If `pg_hba.conf` requires `ident`/`peer` for local connections instead of password authentication, Prisma fails when connecting through `localhost`. This project's database was configured to use `scram-sha-256` password auth for the connection to work with Prisma.
- **Special characters in passwords**: Any reserved URL character in the database password (e.g. `&`, `#`, `@`) must be percent-encoded in `DATABASE_URL`.
- **Driver adapter**: The Prisma Client is instantiated with the `PrismaPg` driver adapter backed by a `pg` `Pool` (see `src/db/prisma.ts`), so `pg` and `@prisma/adapter-pg` are required at runtime.