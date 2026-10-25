import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewData, localEpochSeconds, parseForecast } from '../public/watch-demo/preview_data.js';

const payload = { daily: { time:['2026-10-25'], weather_code:[3], temperature_2m_min:[16.2],
  temperature_2m_max:[23.4], precipitation_probability_max:[30] } };
function setup(fetcher) {
  let current = new Date('2026-10-25T12:00:00Z');
  const clock = [], weather = [], status = [];
  const runtime = { _crabit_sim_set_clock: value => { clock.push(value); return 0; },
    _crabit_sim_set_weather: (...value) => { weather.push(value); return 0; } };
  const data = new PreviewData(runtime, { fetcher, now: () => current, onStatus: value => status.push(value) });
  return { data, clock, weather, status, advance: ms => { current = new Date(current.getTime() + ms); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('public preview can disable weather without disabling the clock or reading cached forecasts', async () => {
  let fetches = 0, reads = 0;
  const clock = [], weather = [], status = [];
  const data = new PreviewData({
    _crabit_sim_set_clock: value => clock.push(value),
    _crabit_sim_set_weather: (...args) => weather.push(args),
  }, {
    weatherEnabled: false,
    storage: { getItem() { reads++; throw new Error('must not read'); } },
    fetcher: async () => { fetches++; throw new Error('must not fetch'); },
    onStatus: text => status.push(text),
  });
  data.setActive(true);
  data.tick();
  await data.refresh();
  assert.equal(fetches, 0);
  assert.equal(reads, 0);
  assert.equal(weather.length, 0);
  assert.ok(clock.length > 0);
  assert.match(status[0], /天气未启用/);
  data.dispose();
});

test('default fetch preserves the browser global receiver', async () => {
  const original = globalThis.fetch;
  let receiver;
  globalThis.fetch = async function () {
    receiver = this;
    return { ok: true, json: async () => payload };
  };
  const s = setup(undefined);
  try {
    s.data.setActive(true);
    await settle();
    assert.equal(receiver, globalThis);
    s.data.tick();
    assert.equal(s.weather.length, 1);
  } finally {
    s.data.dispose();
    globalThis.fetch = original;
  }
});

test('clock uses local wall fields and validates time', () => {
  const date = new Date(2026, 9, 25, 12, 34, 56);
  assert.equal(localEpochSeconds(date), Date.UTC(2026,9,25,12,34,56) / 1000);
  assert.throws(() => localEpochSeconds(new Date('invalid')));
});
test('weather parses daily forecast, not fabricated current temperature', () => {
  assert.deepEqual(parseForecast(payload, 123), { date:20261025,code:3,low:162,high:234,rain:30,fetchedAt:123 });
  for (const [field, value] of [['temperature_2m_min', NaN], ['weather_code', -1], ['precipitation_probability_max', 101], ['time','2026-02-30']]) {
    assert.throws(() => parseForecast({ daily: { ...payload.daily, [field]:[value] } }, 123));
  }
});
test('clock refresh is per second, weather is throttled and paused', async () => {
  let requests = 0;
  const s = setup(async () => { requests++; return { ok:true, json:async () => payload }; });
  s.data.setActive(true);
  await settle();
  for (let i = 0; i < 30; i++) s.data.tick();
  assert.equal(s.clock.length,1);
  assert.equal(s.weather.length,1);
  assert.equal(requests,1);
  s.advance(1000); s.data.tick();
  assert.equal(s.clock.length,2);
  s.data.setActive(false); s.advance(16*60*1000); s.data.tick();
  assert.equal(requests,1);
  s.data.setActive(true); await settle();
  assert.equal(requests,2);
  s.data.dispose();
});
test('late response after disposal cannot modify weather', async () => {
  let complete;
  const s = setup(() => new Promise(resolve => { complete=resolve; }));
  s.data.setActive(true);
  s.data.dispose();
  complete({ok:true,json:async () => payload});
  await settle();
  assert.equal(s.weather.length,0);
});
test('cancelled initial weather request can be retried on resume', async () => {
  let requests=0;
  const completions=[];
  const s=setup(() => { requests++; return new Promise(resolve => completions.push(resolve)); });
  s.data.setActive(true);
  s.data.setActive(false);
  s.data.setActive(true);
  assert.equal(requests,2);
  for (const complete of completions) complete({ok:true,json:async () => payload});
  await settle();
  s.data.tick();
  assert.equal(s.weather.length,1);
  s.data.dispose();
});
test('network failure is observable without advertising fake sunshine or flooding', async () => {
  let requests=0;
  const s = setup(async () => { requests++; throw new Error('offline'); });
  s.data.setActive(true); await settle();
  assert.deepEqual(s.weather.at(-1), [0,0,0,0,0,0]);
  assert.match(s.status.at(-1), /不可用/);
  for(let i=0;i<50;i++) s.data.tick();
  assert.equal(requests,1);
  s.data.dispose();
});
