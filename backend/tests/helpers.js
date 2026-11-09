process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/pawcircle_test';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123';

const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { setPushTransport } = await import('../src/services/pushService.js');

export const app = createApp();
export const api = () => request(app);

export async function setup() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}
export async function teardown() {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
}

export const pushed = [];
setPushTransport(async (messages) => {
  pushed.push(...messages);
  return messages.map(() => ({ status: 'ok' }));
});

let n = 0;
export async function signup(overrides = {}) {
  n += 1;
  const body = {
    email: `user${n}-${Date.now()}@example.com`,
    password: 'correct-horse-battery',
    displayName: `User ${n}`,
    acceptTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
  const res = await api().post('/v1/auth/register').send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body, email: body.email, password: body.password, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export const createPet = async (u, over = {}) =>
  (await api().post('/v1/pets').set(u.auth).send({ name: 'Coco', species: 'dog', breed: 'Golden Retriever', dateOfBirth: '2021-03-05', ...over })).body.pet;
