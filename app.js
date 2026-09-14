(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "weatherTool.lastPresetLocation.v2";

  const els = {
    locationSelect: $("locationSelect"), btnGps: $("btnGps"), btnRefresh: $("btnRefresh"), btnRetry: $("btnRetry"),
    title: $("title"), updated: $("updated"), coordsDisplay: $("coordsDisplay"),
    tabToday: $("tabToday"), tabTomorrow: $("tabTomorrow"), tabWeekly: $("tabWeekly"),
    nowBlock: $("nowBlock"), hiLoOnly: $("hiLoOnly"), temp: $("temp"), icon: $("icon"), desc: $("desc"), hiLo: $("hiLo"),
    listTitle: $("listTitle"), list: $("list"), listFooter: $("listFooter"), graphContainer: $("graphContainer"),
    err: $("err"), errText: $("errText"), mainCard: $("mainCard"), listCard: $("listCard")
  };

  const state = {
    data: null,
    selectedTab: 0,
    lat: 35.561,
    lon: 139.716,
    locationName: "東京都 大田区",
    isGps: false,
    abortController: null
  };

  function setLoading(loading) {
    els.mainCard.classList.toggle("loading", loading);
    els.listCard.classList.toggle("loading", loading);
    els.btnRefresh.disabled = loading;
  }

  function showError(message) {
    els.errText.textContent = message;
    els.err.classList.remove("hide");
  }

  function clearError() {
    els.err.classList.add("hide");
    els.errText.textContent = "";
  }

  function savePreset() {
    if (state.isGps) return; // 正確なGPS座標はlocalStorageへ保存しない
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lat: state.lat,
        lon: state.lon,
        name: state.locationName
      }));
    } catch (_) {}
  }

  function restorePreset() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Number.isFinite(saved.lat) || !Number.isFinite(saved.lon) || !saved.name) return;

      const option = Array.from(els.locationSelect.options).find(opt => opt.dataset.name === saved.name);
      if (!option) return;
      option.selected = true;
      state.lat = saved.lat;
      state.lon = saved.lon;
      state.locationName = saved.name;
    } catch (_) {}
  }

  async function fetchData() {
    clearError();
    setLoading(true);
    els.title.textContent = "データ取得中...";

    if (state.abortController) state.abortController.abort();
    state.abortController = new AbortController();

    try {
      state.data = await WeatherAPI.fetchForecast(state.lat, state.lon, state.abortController.signal);
      WeatherUI.applyBackground(state.data.current_weather.weathercode, state.data.current_weather.is_day);
      renderUI();
    } catch (error) {
      if (error.name !== "AbortError") {
        showError(error.message || "通信エラーが発生しました。ネットワーク接続を確認してください。");
      }
    } finally {
      setLoading(false);
    }
  }

  function renderHeader() {
    const d = state.data;
    els.coordsDisplay.textContent = `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;

    if (state.selectedTab === 0) {
      els.title.textContent = `${state.locationName}｜今日の天気`;
      els.listTitle.textContent = "天気・降水確率・UV・気温推移（現在時刻から）";
      els.nowBlock.classList.remove("hide");
      els.hiLoOnly.classList.add("hide");

      const current = d.current_weather;
      const [icon, text] = WeatherUI.weatherInfo(current.weathercode);
      els.temp.textContent = Math.round(current.temperature);
      els.icon.textContent = icon;
      els.icon.setAttribute("aria-label", text);
      els.desc.textContent = `現在：${text}／風 ${Number(current.windspeed).toFixed(1)} m/s`;
      els.updated.textContent = `更新: ${(current.time.split("T")[1] || "--:--").slice(0,5)}`;

      const max = Math.round(d.daily.temperature_2m_max[0]);
      const min = Math.round(d.daily.temperature_2m_min[0]);
      els.hiLo.textContent = `最高 ${max}°C / 最低 ${min}°C`;
      els.hiLo.style.color = WeatherUI.tempColor(max);
    } else if (state.selectedTab === 1) {
      els.title.textContent = `${state.locationName}｜明日の天気`;
      els.listTitle.textContent = "天気・降水確率・UV・気温推移（明日 0–23時）";
      els.nowBlock.classList.add("hide");
      els.hiLoOnly.classList.remove("hide");
      const max = Math.round(d.daily.temperature_2m_max[1]);
      const min = Math.round(d.daily.temperature_2m_min[1]);
      const pop = d.daily.precipitation_probability_max?.[1];
      els.hiLoOnly.textContent = `最高 ${max}°C / 最低 ${min}°C${Number.isFinite(pop) ? `／降水 ${Math.round(pop)}%` : ""}`;
      els.hiLoOnly.style.color = WeatherUI.tempColor(max);
      els.updated.textContent = "";
    } else {
      els.title.textContent = `${state.locationName}｜週間予報`;
      els.listTitle.textContent = "向こう7日間の天気・降水確率・気温推移";
      els.nowBlock.classList.add("hide");
      els.hiLoOnly.classList.add("hide");
      els.updated.textContent = "";
    }
  }

  function hourlyRowsForSelectedDay() {
    const d = state.data;
    const targetDate = d.daily.time[state.selectedTab];
    const nowIso = d.current_weather.time;
    const rows = [];
    for (let i = 0; i < d.hourly.time.length; i++) {
      const iso = d.hourly.time[i];
      if (!iso.startsWith(targetDate)) continue;
      if (state.selectedTab === 0 && iso < nowIso.slice(0, 13) + ":00") continue;
      rows.push({
        iso,
        pop: d.hourly.precipitation_probability[i] ?? 0,
        temp: d.hourly.temperature_2m[i],
        code: d.hourly.weathercode[i],
        uv: d.hourly.uv_index[i] ?? 0
      });
    }
    return rows;
  }

  function renderHourly() {
    const rows = hourlyRowsForSelectedDay();
    els.listFooter.textContent = "単位: % / °C / UV (Open-Meteo)";
    els.list.innerHTML = "";

    if (!rows.length) {
      els.graphContainer.classList.add("hide");
      els.list.innerHTML = '<div class="empty-state">表示できる時間別予報がありません。</div>';
      return;
    }

    const chartSeries = rows.map(r => ({ label: WeatherUI.hourLabel(r.iso), temp: r.temp }));
    els.graphContainer.innerHTML = WeatherUI.makeSvgLineGraph(chartSeries, "hourly");
    els.graphContainer.classList.remove("hide");

    rows.forEach((r, index) => {
      const [icon, desc] = WeatherUI.weatherInfo(r.code);
      const uv = WeatherUI.uvInfo(r.uv);
      const row = document.createElement("div");
      row.className = "row";
      row.style.animationDelay = `${index * 20}ms`;
      row.setAttribute("aria-label", `${WeatherUI.hourLabel(r.iso)} ${desc} ${Math.round(r.temp)}度 降水確率${Math.round(r.pop)}パーセント UV${uv.uv} ${uv.label}`);
      row.innerHTML = `
        <div class="col-time">${WeatherUI.hourLabel(r.iso)}</div>
        <div class="col-icon" title="${desc}">${icon}</div>
        <div class="col-temp" style="color:${WeatherUI.tempColor(r.temp)}">${Math.round(r.temp)}°</div>
        <div class="col-uv ${uv.className}" title="UV指数 ${uv.uv}（${uv.label}）">UV ${uv.uv}<br>${uv.label}</div>
        <div class="barwrap" aria-hidden="true"><div class="bar ${WeatherUI.precipClass(r.pop)}" style="width:${Math.max(0, Math.min(100, r.pop))}%"></div></div>
        <div class="col-pct">${Math.round(r.pop)}%</div>`;
      els.list.appendChild(row);
    });
  }

  function renderWeekly() {
    const d = state.data;
    els.listFooter.textContent = "単位: °C / 降水確率% (Open-Meteo)";
    els.list.innerHTML = "";

    const chartSeries = d.daily.time.map((date, i) => ({
      label: `${date.split("-")[1]}/${date.split("-")[2]}`,
      max: d.daily.temperature_2m_max[i],
      min: d.daily.temperature_2m_min[i]
    }));
    els.graphContainer.innerHTML = WeatherUI.makeSvgLineGraph(chartSeries, "weekly");
    els.graphContainer.classList.remove("hide");

    d.daily.time.forEach((date, i) => {
      const [icon, desc] = WeatherUI.weatherInfo(d.daily.weathercode[i]);
      const max = d.daily.temperature_2m_max[i];
      const min = d.daily.temperature_2m_min[i];
      const pop = d.daily.precipitation_probability_max?.[i] ?? 0;
      const row = document.createElement("div");
      row.className = "row weekly-row";
      row.style.animationDelay = `${i * 25}ms`;
      row.innerHTML = `
        <div class="col-time">${WeatherUI.dateLabel(date)}</div>
        <div class="weekly-weather"><span aria-hidden="true">${icon}</span> <span class="weekly-desc">${desc}</span></div>
        <div class="col-temp" style="color:#ffaaa6">${Math.round(max)}°</div>
        <div class="col-temp" style="color:#9bd0ff">${Math.round(min)}°</div>
        <div class="weekly-pop" title="最大降水確率">☂ ${Math.round(pop)}%</div>`;
      els.list.appendChild(row);
    });
  }

  function renderUI() {
    if (!state.data) return;
    renderHeader();
    if (state.selectedTab === 2) renderWeekly();
    else renderHourly();
  }

  function setTab(index) {
    state.selectedTab = index;
    const tabs = [els.tabToday, els.tabTomorrow, els.tabWeekly];
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    renderUI();
  }

  function onPresetChange(event) {
    const option = event.target.options[event.target.selectedIndex];
    if (!option || !option.value) return;
    const [lat, lon] = option.value.split(",").map(Number);
    state.lat = lat;
    state.lon = lon;
    state.locationName = option.dataset.name || option.textContent.trim();
    state.isGps = false;
    savePreset();
    fetchData();
  }

  function gpsErrorMessage(error) {
    switch (error.code) {
      case 1: return "位置情報の利用が許可されていません。ブラウザのサイト設定で位置情報を許可してください。";
      case 2: return "現在地を特定できませんでした。GPSやWi-Fiを有効にして再試行してください。";
      case 3: return "位置情報の取得がタイムアウトしました。もう一度お試しください。";
      default: return "位置情報の取得に失敗しました。";
    }
  }

  function getGpsLocation() {
    clearError();
    if (!navigator.geolocation) {
      showError("このブラウザは位置情報取得に対応していません。");
      return;
    }

    els.btnGps.textContent = "⏳";
    els.btnGps.disabled = true;
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        state.lat = position.coords.latitude;
        state.lon = position.coords.longitude;
        state.isGps = true;
        state.locationName = "現在地";

        const name = await WeatherAPI.reverseGeocode(state.lat, state.lon);
        if (name) state.locationName = name;

        let gpsOption = Array.from(els.locationSelect.options).find(opt => opt.dataset.gps === "true");
        if (!gpsOption) {
          gpsOption = document.createElement("option");
          gpsOption.dataset.gps = "true";
          els.locationSelect.add(gpsOption, 0);
        }
        gpsOption.value = `${state.lat},${state.lon}`;
        gpsOption.dataset.name = state.locationName;
        gpsOption.textContent = `${state.locationName}（GPS）`;
        gpsOption.selected = true;
        await fetchData();
      } catch (error) {
        showError(error.message || "現在地の処理中にエラーが発生しました。");
      } finally {
        els.btnGps.textContent = "📍";
        els.btnGps.disabled = false;
      }
    }, error => {
      showError(gpsErrorMessage(error));
      els.btnGps.textContent = "📍";
      els.btnGps.disabled = false;
    }, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000
    });
  }

  function bindEvents() {
    els.locationSelect.addEventListener("change", onPresetChange);
    els.btnGps.addEventListener("click", getGpsLocation);
    els.btnRefresh.addEventListener("click", fetchData);
    els.btnRetry.addEventListener("click", fetchData);

    [els.tabToday, els.tabTomorrow, els.tabWeekly].forEach(tab => {
      tab.addEventListener("click", () => setTab(Number(tab.dataset.index)));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let next = state.selectedTab;
        if (event.key === "ArrowLeft") next = (state.selectedTab + 2) % 3;
        if (event.key === "ArrowRight") next = (state.selectedTab + 1) % 3;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = 2;
        setTab(next);
        [els.tabToday, els.tabTomorrow, els.tabWeekly][next].focus();
      });
    });
  }

  restorePreset();
  bindEvents();
  setTab(0);
  fetchData();
})();
