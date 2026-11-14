const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../weather-api.js'), 'utf8');
function api(fetch, timers = {}) {
  const context = { window: {}, URL, URLSearchParams, AbortController, DOMException, TypeError,
    setTimeout, clearTimeout, fetch, ...timers };
  vm.runInNewContext(source, context);
  return context.window.WeatherAPI;
}
const ok = { ok: true, json: async () => ({ current_weather: { temperature: 20 } }) };
test('temporary network failure retries and returns the forecast', async () => {
  let calls = 0;
  const weather = api(async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return ok; });
  assert.equal((await weather.fetchForecast(35, 139)).current_weather.temperature, 20);
  assert.equal(calls, 2);
});
test('persistent network failure stops after two attempts with Japanese guidance', async () => {
  let calls = 0;
  const weather = api(async () => { calls++; throw new TypeError('Failed to fetch'); });
  await assert.rejects(weather.fetchForecast(35, 139), /天気データの取得に失敗/);
  assert.equal(calls, 2);
});
test('temporary server failure retries, ordinary HTTP errors do not', async () => {
  let calls = 0;
  const weather = api(async () => ++calls === 1 ? { ok: false, status: 503 } : ok);
  await weather.fetchForecast(35, 139);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(api(async () => { calls++; return { ok: false, status: 400 }; }).fetchForecast(35, 139), /HTTP 400/);
  assert.equal(calls, 1);
});
test('cancelling an active request prevents retries', async () => {
  let calls = 0;
  const controller = new AbortController();
  const weather = api(async (_, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  });
  const result = weather.fetchForecast(35, 139, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('timeout aborts requests and reports timeout after bounded retries', async () => {
  let calls = 0;
  const weather = api(async (_, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  }, { setTimeout: callback => setTimeout(callback, 1) });
  await assert.rejects(weather.fetchForecast(35, 139), /タイムアウト/);
  assert.equal(calls, 2);
});
