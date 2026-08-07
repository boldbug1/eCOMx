import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

const API = '/api/v1';

let ownerId: string;
let otherId: string;
let adminId: string;
let ownerToken: string;
let otherToken: string;
let adminToken: string;
let ownerOrderId: string;
let otherOrderId: string;
let adminOrderId: string;

const unique = Date.now().toString(36);
const emails = {
  owner: `owner-${unique}@test.com`,
  other: `other-${unique}@test.com`,
  admin: `admin-${unique}@test.com`,
};

const password = 'testpassword123';

async function register(email: string) {
  const res = await request(app).post(`${API}/register`).send({ email, password });
  expect(res.status).toBe(201);
}

async function login(email: string) {
  const res = await request(app).post(`${API}/login`).send({ email, password });
  expect(res.status).toBe(200);
  return res.body.user.token as string;
}

function validOrderBody() {
  return {
    customerName: 'John Doe',
    totalAmount: 99.99,
    items: [{ productId: 'prod-1', quantity: 2, price: 49.99 }],
  };
}

beforeAll(async () => {
  await register(emails.owner);
  await register(emails.other);
  await register(emails.admin);

  ownerId = (await prisma.user.findUniqueOrThrow({ where: { email: emails.owner } })).id;
  otherId = (await prisma.user.findUniqueOrThrow({ where: { email: emails.other } })).id;
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: emails.admin } })).id;

  await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });

  ownerToken = await login(emails.owner);
  otherToken = await login(emails.other);
  adminToken = await login(emails.admin);

  const ownerOrder = await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(validOrderBody());
  ownerOrderId = ownerOrder.body.order.id;

  const otherOrder = await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${otherToken}`)
    .send(validOrderBody());
  otherOrderId = otherOrder.body.order.id;

  const adminOrder = await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(validOrderBody());
  adminOrderId = adminOrder.body.order.id;
});

afterAll(async () => {
  await prisma.order.deleteMany({
    where: { userId: { in: [ownerId, otherId, adminId] } },
  });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.$disconnect();
});

describe('Health', () => {
  it('GET / responds 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.health).toBe('ok');
  });
});

describe('Auth', () => {
  it('register with invalid body returns 400', async () => {
    const res = await request(app).post(`${API}/register`).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('register with duplicate email returns 409', async () => {
    const res = await request(app).post(`${API}/register`).send({ email: emails.owner, password });
    expect(res.status).toBe(409);
  });

  it('login with wrong password returns 401', async () => {
    const res = await request(app)
      .post(`${API}/login`)
      .send({ email: emails.owner, password: 'wrongpassword123' });
    expect(res.status).toBe(401);
  });

  it('login with unknown email returns 401', async () => {
    const res = await request(app)
      .post(`${API}/login`)
      .send({ email: 'nobody@test.com', password });
    expect(res.status).toBe(401);
  });

  it('login with valid credentials returns a token', async () => {
    const res = await request(app)
      .post(`${API}/login`)
      .send({ email: emails.owner, password });
    expect(res.status).toBe(200);
    expect(res.body.user.token).toBeDefined();
  });
});

describe('Orders - authentication', () => {
  it.each([
    ['POST', 'orders'],
    ['GET', 'orders'],
    ['GET', 'orders/some-id'],
    ['PATCH', 'orders/some-id'],
    ['DELETE', 'orders/some-id'],
  ])('%s /%s without a token returns 401', async (method, path) => {
    const res = await request(app)[method.toLowerCase() as 'post'](`${API}/${path}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', 'Bearer not.a.real.token')
      .send(validOrderBody());
    expect(res.status).toBe(401);
  });
});

describe('Orders - create', () => {
  it('creates an order stamped with the token owner', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(validOrderBody());

    expect(res.status).toBe(201);
    expect(res.body.order.userId).toBe(ownerId);
    expect(res.body.order.items).toHaveLength(1);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'No items here' });

    expect(res.status).toBe(400);
  });
});

describe('Orders - read', () => {
  it('GET /orders returns only the owner orders', async () => {
    const res = await request(app)
      .get(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.orders.map((o: { id: string }) => o.id);
    expect(ids).toContain(ownerOrderId);
    expect(ids).not.toContain(otherOrderId);
  });

  it('GET /orders/:id returns the owner order', async () => {
    const res = await request(app)
      .get(`${API}/orders/${ownerOrderId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(ownerOrderId);
  });

  it('GET /orders/:id of another user returns 404', async () => {
    const res = await request(app)
      .get(`${API}/orders/${otherOrderId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('GET /orders/:id of a nonexistent order returns 404', async () => {
    const res = await request(app)
      .get(`${API}/orders/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Orders - permissions (USER)', () => {
  it('USER cannot update an order: 403', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${ownerOrderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'processing' });

    expect(res.status).toBe(403);
  });

  it('USER cannot delete an order: 403', async () => {
    const res = await request(app)
      .delete(`${API}/orders/${ownerOrderId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Orders - update (ADMIN)', () => {
  it('updates the own order', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('processing');
  });

  it('PATCH {} applies the status default (route quirk)', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    // OrderSchema.partial() keeps status' `.default("pending")`, so an empty
    // body parses to { status: "pending" }; the route's empty-body guard
    // (Object.keys(validatedData).length === 0) therefore never fires.
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('pending');
  });

  it('rejects an invalid body with 400', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ totalAmount: -5 });

    expect(res.status).toBe(400);
  });

  it('cannot update another user order: 404', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${otherOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' });

    expect(res.status).toBe(404);
  });

  it('replaces items when items are sent', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: 'prod-2', quantity: 1, price: 10 }] });

    expect(res.status).toBe(200);
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].productId).toBe('prod-2');
  });
});

describe('Orders - delete (ADMIN)', () => {
  it('deletes the own order', async () => {
    const res = await request(app)
      .delete(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('cannot delete another user order: 404', async () => {
    const res = await request(app)
      .delete(`${API}/orders/${otherOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('deleting an already deleted order returns 404', async () => {
    const res = await request(app)
      .delete(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
