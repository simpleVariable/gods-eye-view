import test from 'node:test';
import assert from 'node:assert/strict';
import { isRuntimeConfigPath, isSubscriptionExemptPath, subscriptionTierForPath } from '../server/subscriptionPolicy.js';
import { subscriptionPlugin } from '../server/subscriptionPlugin.js';

function createHandler() {
  let handler;
  subscriptionPlugin().configureServer({
    middlewares: { use: (middleware) => { handler = middleware; } },
  });
  return handler;
}

function createResponse() {
  return {
    headersSent: false,
    headers: {},
    writeHead(status, headers = {}) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    setHeader(name, value) { this.headers[name] = value; },
    end(body = '') {
      this.body = body;
      this.headersSent = true;
    },
  };
}

test('paid APIs are matched on path boundaries', () => {
  for (const path of ['/api/realtime/token', '/api/ais-live', '/api/ais-live/track', '/api/tomtom/status']) {
    assert.equal(subscriptionTierForPath(path), 'paid', path);
  }
  for (const path of ['/api/opensky', '/api/cctv/sources', '/api/ais-liveXYZ']) {
    assert.equal(subscriptionTierForPath(path), 'free', path);
  }
  assert.equal(isRuntimeConfigPath('/api/config'), true);
  assert.equal(subscriptionTierForPath('/api/config'), 'free');
  assert.equal(isSubscriptionExemptPath('/api/account/login'), true);
  assert.equal(isSubscriptionExemptPath('/api/stripe/webhook'), true);
});

test('free-for-all permits paid API traffic without a database', async () => {
  const original = {
    free: process.env.GEV_FREE_FOR_ALL,
    database: process.env.DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  process.env.GEV_FREE_FOR_ALL = '1';
  try {
    let continued = false;
    await createHandler()({ url: '/api/ais-live', method: 'GET', headers: {}, socket: {} }, createResponse(), () => { continued = true; });
    assert.equal(continued, true);
  } finally {
    if (original.free === undefined) delete process.env.GEV_FREE_FOR_ALL;
    else process.env.GEV_FREE_FOR_ALL = original.free;
    if (original.database === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original.database;
  }
});

test('paid API traffic fails closed without a subscription database', async () => {
  const original = {
    free: process.env.GEV_FREE_FOR_ALL,
    database: process.env.DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  process.env.GEV_FREE_FOR_ALL = '0';
  try {
    const response = createResponse();
    await createHandler()({ url: '/api/ais-live', method: 'GET', headers: {}, socket: {} }, response, () => assert.fail('paid route should be blocked'));
    assert.equal(response.statusCode, 503);
  } finally {
    if (original.free === undefined) delete process.env.GEV_FREE_FOR_ALL;
    else process.env.GEV_FREE_FOR_ALL = original.free;
    if (original.database === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original.database;
  }
});

test('free CCTV frames bypass the metered Google fallback', async () => {
  const original = {
    free: process.env.GEV_FREE_FOR_ALL,
    database: process.env.DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  process.env.GEV_FREE_FOR_ALL = '0';
  try {
    const req = { url: '/api/cctv/frame/camera-1', method: 'GET', headers: {}, socket: {} };
    let continued = false;
    await createHandler()(req, createResponse(), () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.gevAllowGoogleFallback, false);
  } finally {
    if (original.free === undefined) delete process.env.GEV_FREE_FOR_ALL;
    else process.env.GEV_FREE_FOR_ALL = original.free;
    if (original.database === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original.database;
  }
});

test('runtime config withholds provider keys when free-for-all is disabled', async () => {
  const original = {
    free: process.env.GEV_FREE_FOR_ALL,
    database: process.env.DATABASE_URL,
    google: process.env.GOOGLE_MAPS_API_KEY,
    cesium: process.env.CESIUM_ION_TOKEN,
  };
  delete process.env.DATABASE_URL;
  process.env.GEV_FREE_FOR_ALL = '0';
  process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
  process.env.CESIUM_ION_TOKEN = 'test-cesium-token';
  try {
    const response = createResponse();
    await createHandler()({ url: '/api/config', method: 'GET', headers: {}, socket: {} }, response, () => assert.fail('config should be handled'));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      googleMapsApiKey: null,
      cesiumIonToken: null,
      paidFeatures: false,
    });
  } finally {
    for (const [key, value] of Object.entries({
      GEV_FREE_FOR_ALL: original.free,
      DATABASE_URL: original.database,
      GOOGLE_MAPS_API_KEY: original.google,
      CESIUM_ION_TOKEN: original.cesium,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('runtime config returns browser keys only while free-for-all is enabled', async () => {
  const original = {
    free: process.env.GEV_FREE_FOR_ALL,
    database: process.env.DATABASE_URL,
    google: process.env.GOOGLE_MAPS_API_KEY,
    cesium: process.env.CESIUM_ION_TOKEN,
    serverGoogle: process.env.GOOGLE_MAPS_SERVER_API_KEY,
  };
  delete process.env.DATABASE_URL;
  process.env.GEV_FREE_FOR_ALL = '1';
  process.env.GOOGLE_MAPS_API_KEY = 'test-browser-key';
  process.env.CESIUM_ION_TOKEN = 'test-ion-token';
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'private-server-key';
  try {
    const response = createResponse();
    await createHandler()({ url: '/api/config', method: 'GET', headers: {}, socket: {} }, response, () => assert.fail('config should be handled'));
    assert.deepEqual(JSON.parse(response.body), {
      googleMapsApiKey: 'test-browser-key',
      cesiumIonToken: 'test-ion-token',
      paidFeatures: true,
    });
  } finally {
    for (const [key, value] of Object.entries({
      GEV_FREE_FOR_ALL: original.free,
      DATABASE_URL: original.database,
      GOOGLE_MAPS_API_KEY: original.google,
      CESIUM_ION_TOKEN: original.cesium,
      GOOGLE_MAPS_SERVER_API_KEY: original.serverGoogle,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
