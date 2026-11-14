(function (global) {
  "use strict";

  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const REVERSE_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

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

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`天気データの取得に失敗しました（HTTP ${response.status}）`);
    }
    return response.json();
  }

  async function searchCities(query, signal) {
    const name = query.normalize("NFKC").trim();
    if (name.length < 2) return [];
    // 「横浜」でも「横浜市」が見つかるよう自治体名でも検索。
    const queries = /[市区町村]$/.test(name) ? [name] : [name, `${name}市`];
    const pages = await Promise.all(queries.map(async term => {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.search = new URLSearchParams({ name: term, count: "20", language: "ja", countryCode: "JP" });
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`都市の検索に失敗しました（HTTP ${response.status}）`);
      return (await response.json()).results || [];
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
