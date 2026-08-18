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

// Seeded products (created via the ADMIN API so the routes are exercised too)
let widget: { id: string; price: number; stock: number }; // stock 10, price 49.99
let widgetB: { id: string; price: number };                // stock 5,  price 10
let lowStock: { id: string; stock: number };               // stock 2,  price 20

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

function orderBody(productId: string, qty = 1) {
  return {
    customerName: 'John Doe',
    items: [{ productId, quantity: qty }],
  };
}

async function createStandaloneProduct(name: string, price: number, stock: number) {
  const res = await request(app)
    .post(`${API}/products`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name, description: `${name} description`, price, stock });
  expect(res.status).toBe(201);
  return res.body.product as { id: string; price: number; stock: number };
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

  const createProduct = async (name: string, price: number, stock: number) => {
    const res = await request(app)
      .post(`${API}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, description: `${name} description`, price, stock });
    expect(res.status).toBe(201);
    return res.body.product;
  };

  widget = await createProduct('Widget A', 49.99, 10);
  widgetB = await createProduct('Widget B', 10, 5);
  lowStock = await createProduct('Rare Widget', 20, 2);

  await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(orderBody(widget.id, 2));
  const ownerOrder = await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send(orderBody(widgetB.id, 1));
  ownerOrderId = ownerOrder.body.order.id;

  const otherOrder = await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${otherToken}`)
    .send(orderBody(widgetB.id, 1));
  otherOrderId = otherOrder.body.order.id;

  const adminOrder = await request(app)
    .post(`${API}/orders`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(orderBody(widget.id, 1));
  adminOrderId = adminOrder.body.order.id;
});

afterAll(async () => {
  await prisma.order.deleteMany({
    where: { userId: { in: [ownerId, otherId, adminId] } },
  });
  await prisma.product.deleteMany({ where: { createdById: { in: [adminId] } } });
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
      .send({ email: 'nobody@test.com', password: 'testpassword123' });
    expect(res.status).toBe(401);
  });

  it('login with valid credentials returns a token', async () => {
    const res = await request(app)
      .post(`${API}/login`)
      .send({ email: emails.owner, password: 'testpassword123' });
    expect(res.status).toBe(200);
    expect(res.body.user.token).toBeDefined();
  });
});

describe('Orders - authentication', () => {
  it.each([
    ['POST', 'orders'],
    ['GET', 'orders'],
    ['GET', 'orders/:id'],
    ['PATCH', 'orders/:id'],
    ['DELETE', 'orders/:id'],
  ])('%s /%s without a token returns 401', async (method, path) => {
    const url = path === 'orders/:id' ? `${API}/orders/unknown` : `${API}/${path}`;
    const res = await request(app)[method.toLowerCase() as 'post' | 'get' | 'patch' | 'delete'](url);
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', 'Bearer not.a.real.token')
      .send(orderBody(widget.id));
    expect(res.status).toBe(401);
  });
});

describe('Orders - create', () => {
  it('creates an order stamped with the token owner', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(orderBody(widget.id, 1));

    expect(res.status).toBe(201);
    expect(res.body.order.userId).toBe(ownerId);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'No items here' });

    expect(res.status).toBe(400);
  });

  it('snapshots the DB price, not anything client-sent', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Jane', items: [{ productId: widgetB.id, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.order.totalAmount).toBeCloseTo(widgetB.price, 2);
    expect(res.body.order.items[0].price).toBeCloseTo(widgetB.price, 2);
  });

  it('rejects an order with a nonexistent product: 400', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Jane', items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] });

    expect(res.status).toBe(400);
  });

  it('rejects overselling: buying more than stock returns 400', async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Jane', items: [{ productId: lowStock.id, quantity: 99 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/left/);
  });

  it('decrements product stock after a purchase', async () => {
    const product = await createStandaloneProduct('Decrement Widget', 5, 10);
    const orderRes = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Jane', items: [{ productId: product.id, quantity: 3 }] });

    expect(orderRes.status).toBe(201);

    const productRes = await request(app).get(`${API}/products/${product.id}`);
    expect(productRes.status).toBe(200);
    expect(productRes.body.product.stock).toBe(7);
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
  it('replaces items with server-price snapshots', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: widgetB.id, quantity: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].productId).toBe(widgetB.id);
    expect(res.body.order.items[0].price).toBeCloseTo(widgetB.price, 2);
  });

  it('rejects an item replacement with a nonexistent product: 400', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid body with 400', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'not-a-valid-status' });

    expect(res.status).toBe(400);
  });

  it('cannot update another user order: 404', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${otherOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' });

    expect(res.status).toBe(404);
  });

  it('updates the own order (status)', async () => {
    const res = await request(app)
      .patch(`${API}/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('processing');
  });
});

describe('Orders - delete (ADMIN)', () => {
  let deleteOrderId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(orderBody(widget.id, 1));
    deleteOrderId = res.body.order.id;
  });

  it('deletes the own order', async () => {
    const res = await request(app)
      .delete(`${API}/orders/${deleteOrderId}`)
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
      .delete(`${API}/orders/${deleteOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Products - catalog (public)', () => {
  it('GET /products works without a token', async () => {
    const res = await request(app).get(`${API}/products`);
    expect(res.status).toBe(200);
    const ids = res.body.products.map((p: { id: string }) => p.id);
    expect(ids).toContain(widget.id);
  });

  it('GET /products/:id works without a token', async () => {
    const res = await request(app).get(`${API}/products/${widget.id}`);
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBeCloseTo(49.99, 2);
  });

  it('GET /products/:id of a nonexistent product returns 404', async () => {
    const res = await request(app).get(`${API}/products/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });
});

describe('Products - create', () => {
  it('requires a token: 401', async () => {
    const res = await request(app).post(`${API}/products`).send({});
    expect(res.status).toBe(401);
  });

  it('USER cannot create a product: 403', async () => {
    const res = await request(app)
      .post(`${API}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Nope', description: 'x', price: 1, stock: 1 });
    expect(res.status).toBe(403);
  });

  it('ADMIN creates a product stamped with their id', async () => {
    const res = await request(app)
      .post(`${API}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Unique Gadget', description: 'made in tests', price: 19.99, stock: 4 });

    expect(res.status).toBe(201);
    expect(res.body.product.createdById).toBe(adminId);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post(`${API}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Missing everything else' });

    expect(res.status).toBe(400);
  });
});

describe('Products - update', () => {
  it('USER cannot update a product: 403', async () => {
    const res = await request(app)
      .patch(`${API}/products/${widget.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ price: 1 });
    expect(res.status).toBe(403);
  });

  it('ADMIN updates a product', async () => {
    const res = await request(app)
      .patch(`${API}/products/${widget.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 59.99 });

    expect(res.status).toBe(200);
    expect(res.body.product.price).toBe(59.99);
  });

  it('ADMIN cannot update an unknown id: 404', async () => {
    const res = await request(app)
      .patch(`${API}/products/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 1 });

    expect(res.status).toBe(404);
  });

  it('ADMIN cannot empty-body update: 400', async () => {
    const res = await request(app)
      .patch(`${API}/products/${widget.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('Products - delete', () => {
  it('USER cannot delete a product: 403', async () => {
    const res = await request(app)
      .delete(`${API}/products/${widget.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN deletes a product with no order history', async () => {
    const product = await request(app)
      .post(`${API}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Soon Gone', description: 'x', price: 5, stock: 1 });
    expect(product.status).toBe(201);

    const res = await request(app)
      .delete(`${API}/products/${product.body.product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('ADMIN cannot delete a product with order history: 400 (P2003)', async () => {
    const product = await request(app)
      .post(`${API}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'History Product', description: 'sold before', price: 30, stock: 5 });

    await request(app)
      .post(`${API}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerName: 'Buyer', items: [{ productId: product.body.product.id, quantity: 1 }] });

    const res = await request(app)
      .delete(`${API}/products/${product.body.product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/stock to 0/i);
  });

  it('ADMIN deleting an unknown id returns 404', async () => {
    const res = await request(app)
      .delete(`${API}/products/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});