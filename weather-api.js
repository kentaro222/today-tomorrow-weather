(function (global) {
  "use strict";

  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const REVERSE_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

  async function fetchJson(url, signal, label) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      signal?.addEventListener("abort", cancel, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 12000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          if (attempt === 0 && [502, 503, 504].includes(response.status)) continue;
          throw new Error(`${label}に失敗しました（HTTP ${response.status}）。少し待ってから再試行してください。`);
        }
        return await response.json();
      } catch (error) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const networkError = error instanceof TypeError || timedOut;
        if (networkError && attempt === 0) continue;
        if (networkError) {
          throw new Error(timedOut
            ? `${label}がタイムアウトしました。通信状況を確認して再試行してください。`
            : `${label}に失敗しました。Wi-Fi・モバイル通信や、VPN・コンテンツブロッカーの設定を確認して再試行してください。`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      }
    }
  }

  async function fetchForecast(lat, lon, signal) {
    const url = new URL(FORECAST_URL);
    const params = {
      latitude: lat,
      longitude: lon,
      timezone: "Asia/Tokyo",
      wind_speed_unit: "ms",
      current_weather: "true",
      hourly: "precipitation_probability,temperature_2m,weathercode,uv_index",
      daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: "7"
    };
    url.search = new URLSearchParams(params).toString();

    return fetchJson(url, signal, "天気データの取得");
  }

  async function searchCities(query, signal) {
    const name = query.normalize("NFKC").trim();
    if (name.length < 2) return [];
    // 「横浜」でも「横浜市」が見つかるよう自治体名でも検索。
    const queries = /[市区町村]$/.test(name) ? [name] : [name, `${name}市`];
    const pages = await Promise.all(queries.map(async term => {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.search = new URLSearchParams({ name: term, count: "20", language: "ja", countryCode: "JP" });
      return (await fetchJson(url, signal, "都市の検索")).results || [];
    }));
    const unique = new Map();
    pages.flat().filter(p => p.country_code === "JP" && /^(PPL|ADM)/.test(p.feature_code || "") &&
      Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .sort((a, b) => (b.population || 0) - (a.population || 0))
      .forEach(p => unique.set(p.id, { lat: p.latitude, lon: p.longitude,
        name: [...new Set([p.admin1, p.name].filter(Boolean))].join(" ") }));
    return [...unique.values()].slice(0, 20);
  }

  async function reverseGeocode(lat, lon, signal) {
    try {
      const url = new URL(REVERSE_GEOCODE_URL);
      url.search = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        localityLanguage: "ja"
      }).toString();

      const response = await fetch(url, { signal });
      if (!response.ok) return null;
      const result = await response.json();

      const prefecture = result.principalSubdivision || result.localityInfo?.administrative?.[1]?.name || "";
      const locality = result.city || result.locality || result.localityInfo?.administrative?.[2]?.name || "";
      const name = [prefecture, locality].filter(Boolean).join(" ").trim();
      return name || null;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      return null;
    }
  }

  global.WeatherAPI = { fetchForecast, reverseGeocode, searchCities };
})(window);
