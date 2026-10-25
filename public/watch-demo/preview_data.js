// Host-only data injection. No geolocation, BLE or firmware writes.
export const weatherSource = Object.freeze({
  city: '重庆', latitude: 29.56, longitude: 106.55,
  url: 'https://api.open-meteo.com/v1/forecast?latitude=29.56&longitude=106.55&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max&forecast_days=1&timezone=Asia%2FShanghai',
});
const REFRESH_MS = 15 * 60 * 1000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = 'crabit-preview-weather-chongqing-v1';

export function localEpochSeconds(date) {
  const value = Math.floor(date.getTime() / 1000) - date.getTimezoneOffset() * 60;
  if (!Number.isFinite(value) || date.getFullYear() < 2000 || date.getFullYear() > 2099) {
    throw new RangeError('预览时间超出支持范围');
  }
  return value;
}

export function parseForecast(payload, fetchedAt) {
  const daily = payload?.daily;
  const date = daily?.time?.[0];
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) throw new Error('天气日期无效');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('天气日期无效');
  const code = daily.weather_code?.[0];
  const low = daily.temperature_2m_min?.[0], high = daily.temperature_2m_max?.[0];
  const rain = daily.precipitation_probability_max?.[0];
  if (!Number.isInteger(code) || code < 0 || code > 99 ||
      !Number.isFinite(low) || !Number.isFinite(high) || low < -100 || high > 100 || low > high ||
      !Number.isInteger(rain) || rain < 0 || rain > 100 || !Number.isFinite(fetchedAt)) {
    throw new Error('天气数据无效');
  }
  return { date: Number(date.replaceAll('-', '')), code, low: Math.round(low * 10),
    high: Math.round(high * 10), rain, fetchedAt };
}

export class PreviewData {
  constructor(runtime, { fetcher = (...args) => globalThis.fetch(...args), now = () => new Date(), storage = null,
    onStatus = () => {}, weatherEnabled = true } = {}) {
    this.runtime = runtime;
    this.fetcher = fetcher;
    this.now = now;
    this.storage = storage;
    this.onStatus = onStatus;
    this.weatherEnabled = weatherEnabled;
    this.active = false;
    this.closed = false;
    this.lastSecond = null;
    this.lastAttempt = -Infinity;
    this.weather = null;
    this.appliedWeather = null;
    this.request = null;
    if (!weatherEnabled) {
      this.onStatus('本机时间 · 天气未启用 · 其他读数为模拟');
      return;
    }
    try {
      const cached = JSON.parse(storage?.getItem(CACHE_KEY) ?? 'null');
      if (cached && Number.isInteger(cached.date) && Number.isInteger(cached.code) &&
          Number.isInteger(cached.low) && Number.isInteger(cached.high) &&
          Number.isInteger(cached.rain) && Number.isFinite(cached.fetchedAt) &&
          this.now().getTime() >= cached.fetchedAt && this.now().getTime() - cached.fetchedAt < REFRESH_MS) {
        this.weather = cached;
        this.lastAttempt = cached.fetchedAt;
      }
    } catch { /* Storage is optional; no user profile dependency. */ }
  }
  setActive(active) {
    this.active = active && !this.closed;
    if (!this.active && this.request) {
      this.request.abort();
      this.request = null;
      // A cancelled initial fetch is not a completed refresh: try on resume.
      if (!this.weather) this.lastAttempt = -Infinity;
    }
    if (this.active) this.tick();
  }
  clearWeather() {
    this.weather = null;
    this.appliedWeather = null;
    this.runtime._crabit_sim_set_weather(0, 0, 0, 0, 0, 0);
    this.onStatus('本机时间 · 重庆天气暂不可用 · 其他读数为模拟');
  }
  tick() {
    if (!this.active || this.closed) return;
    const date = this.now(), millis = date.getTime();
    const second = localEpochSeconds(date);
    if (second !== this.lastSecond) {
      this.runtime._crabit_sim_set_clock(second);
      this.lastSecond = second;
    }
    if (!this.weatherEnabled) return;
    if (this.weather) {
      if (millis < this.weather.fetchedAt || millis - this.weather.fetchedAt > MAX_AGE_MS) this.clearWeather();
      else if (this.weather !== this.appliedWeather) {
        const w = this.weather;
        if (this.runtime._crabit_sim_set_weather(w.date, w.code, w.low, w.high, w.rain,
            Math.floor(w.fetchedAt / 1000)) === 0) {
          this.onStatus('本机时间 · 重庆日预报 · 其他读数为模拟');
          this.appliedWeather = w;
        } else this.clearWeather();
      }
    }
    if (millis < this.lastAttempt) this.lastAttempt = -Infinity;
    if (!this.request && millis - this.lastAttempt >= REFRESH_MS) void this.refresh();
  }
  async refresh() {
    if (!this.weatherEnabled || !this.active || this.closed || this.request) return;
    this.lastAttempt = this.now().getTime();
    const request = new AbortController();
    this.request = request;
    const timeout = setTimeout(() => request.abort(), 10000);
    if (!this.weather) this.onStatus('本机时间 · 重庆天气获取中 · 其他读数为模拟');
    try {
      const response = await this.fetcher(weatherSource.url, { signal: request.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('天气服务不可用');
      const value = parseForecast(await response.json(), this.now().getTime());
      if (this.request !== request || !this.active || this.closed) return;
      this.weather = value;
      try { this.storage?.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* optional cache */ }
    } catch {
      if (this.request === request && this.active && !this.closed) this.clearWeather();
    } finally {
      clearTimeout(timeout);
      if (this.request === request) this.request = null;
    }
  }
  dispose() {
    this.setActive(false);
    this.closed = true;
  }
}
