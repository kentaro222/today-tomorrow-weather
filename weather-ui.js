(function (global) {
  "use strict";

  const WMAP = {
    0:["☀️","快晴"], 1:["🌤","晴れ"], 2:["⛅","薄曇り"], 3:["☁️","くもり"],
    45:["🌫","霧"], 48:["🌫","霧"],
    51:["🌦","弱い霧雨"], 53:["🌦","霧雨"], 55:["🌦","強い霧雨"],
    56:["🌧","着氷性霧雨"], 57:["🌧","強い着氷性霧雨"],
    61:["🌧","弱い雨"], 63:["🌧","雨"], 65:["🌧","強い雨"],
    66:["🌧","着氷性雨"], 67:["🌧","強い着氷性雨"],
    71:["🌨","弱い雪"], 73:["🌨","雪"], 75:["🌨","大雪"], 77:["🌨","雪あられ"],
    80:["🌦","にわか雨(弱)"], 81:["🌦","にわか雨"], 82:["⛈","にわか雨(強)"],
    85:["🌨","にわか雪(弱)"], 86:["🌨","にわか雪(強)"],
    95:["⛈","雷雨"], 96:["⛈","雷雨(雹)"], 99:["⛈","激しい雷雨(雹)"]
  };

  function weatherInfo(code) {
    return WMAP[code] || ["❓", "不明"];
  }

  function tempColor(temp) {
    let hue = 240 - (temp * 7);
    hue = Math.min(280, Math.max(0, hue));
    return `hsl(${hue}, 80%, 72%)`;
  }

  function uvInfo(value) {
    const uv = Math.max(0, Math.round(value || 0));
    if (uv <= 2) return { uv, label: "低い", className: "uv-low" };
    if (uv <= 5) return { uv, label: "中程度", className: "uv-moderate" };
    if (uv <= 7) return { uv, label: "強い", className: "uv-high" };
    if (uv <= 10) return { uv, label: "非常に強い", className: "uv-very-high" };
    return { uv, label: "極端", className: "uv-extreme" };
  }

  function precipClass(value) {
    if (value <= 20) return "pop-low";
    if (value <= 50) return "pop-mid";
    if (value <= 80) return "pop-high";
    return "pop-very-high";
  }

  function dayName(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  }

  function dateLabel(isoDate) {
    const [, m, d] = isoDate.split("-").map(Number);
    return `${m}/${d}(${dayName(isoDate)})`;
  }

  function hourLabel(iso) {
    const time = iso.split("T")[1] || "--:--";
    return time.slice(0, 5);
  }

  function backgroundClass(code, isDay) {
    if (Number(isDay) === 0) return "is-night";
    if ([95, 96, 99].includes(code)) return "weather-stormy";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "weather-snowy";
    if (code >= 51) return "weather-rainy";
    if (code <= 2) return "weather-sunny";
    return "weather-cloudy";
  }

  function applyBackground(code, isDay) {
    document.body.classList.remove("weather-sunny", "weather-cloudy", "weather-rainy", "weather-snowy", "weather-stormy", "is-night", "is-day");
    const cls = backgroundClass(code, isDay);
    document.body.classList.add(cls);
    document.body.classList.add(Number(isDay) === 0 ? "is-night" : "is-day");
  }

  function makeSvgLineGraph(series, mode) {
    if (!series || series.length < 2) return "";

    const width = 560;
    const height = 90;
    const left = 18;
    const right = 18;
    const top = 22;
    const bottom = 28;
    const plotW = width - left - right;
    const plotH = height;

    const allTemps = mode === "weekly"
      ? series.flatMap(x => [x.max, x.min])
      : series.map(x => x.temp);
    const minT = Math.floor(Math.min(...allTemps) - 2);
    const maxT = Math.ceil(Math.max(...allTemps) + 2);
    const range = Math.max(1, maxT - minT);
    const xAt = i => left + (plotW * i / Math.max(1, series.length - 1));
    const yAt = t => top + plotH - ((t - minT) / range) * plotH;

    const axis = [0, 0.5, 1].map(frac => {
      const y = top + plotH * frac;
      const temp = Math.round(maxT - range * frac);
      return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="graph-axis" /><text x="${left}" y="${y-3}" class="graph-label" text-anchor="start">${temp}°</text>`;
    }).join("");

    if (mode === "weekly") {
      const maxPts = series.map((x, i) => `${xAt(i)},${yAt(x.max)}`).join(" ");
      const minPts = series.map((x, i) => `${xAt(i)},${yAt(x.min)}`).join(" ");
      const dots = series.map((x, i) => {
        const px = xAt(i);
        return `<circle cx="${px}" cy="${yAt(x.max)}" r="3" class="graph-dot-max" />
          <circle cx="${px}" cy="${yAt(x.min)}" r="3" class="graph-dot-min" />
          <text x="${px}" y="${yAt(x.max)-8}" class="graph-label">${Math.round(x.max)}°</text>
          <text x="${px}" y="${yAt(x.min)+15}" class="graph-label">${Math.round(x.min)}°</text>
          <text x="${px}" y="${top+plotH+22}" class="graph-label">${x.label}</text>`;
      }).join("");
      return `<svg class="weather-graph" viewBox="0 0 ${width} ${top+plotH+bottom}" role="img" aria-label="週間の最高・最低気温推移">${axis}<polyline points="${maxPts}" fill="none" class="graph-line-max" stroke-width="2.5" /><polyline points="${minPts}" fill="none" class="graph-line-min" stroke-width="2.5" />${dots}</svg>`;
    }

    const pts = series.map((x, i) => `${xAt(i)},${yAt(x.temp)}`).join(" ");
    const dots = series.map((x, i) => {
      const px = xAt(i), py = yAt(x.temp);
      const showLabel = series.length <= 12 || i % 2 === 0 || i === series.length - 1;
      return `<circle cx="${px}" cy="${py}" r="3" class="graph-dot-hourly" />
        ${showLabel ? `<text x="${px}" y="${py-9}" class="graph-label">${Math.round(x.temp)}°</text><text x="${px}" y="${top+plotH+22}" class="graph-label">${x.label}</text>` : ""}`;
    }).join("");
    return `<svg class="weather-graph" viewBox="0 0 ${width} ${top+plotH+bottom}" role="img" aria-label="時間別気温推移">${axis}<polyline points="${pts}" fill="none" class="graph-line-hourly" stroke-width="2.5" />${dots}</svg>`;
  }

  global.WeatherUI = {
    weatherInfo,
    tempColor,
    uvInfo,
    precipClass,
    dayName,
    dateLabel,
    hourLabel,
    applyBackground,
    makeSvgLineGraph
  };
})(window);
