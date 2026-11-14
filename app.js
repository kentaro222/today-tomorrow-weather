(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "weatherTool.lastPresetLocation.v2";

  const CITIES_KEY = "weatherTool.savedCities.v1";
  let searchController;

  const els = {
    searchForm: $("citySearchForm"), cityQuery: $("cityQuery"), cityResults: $("cityResults"),
    searchStatus: $("searchStatus"), storageStatus: $("storageStatus"),
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

  function validCity(city) {
    return city && Number.isFinite(city.lat) && Math.abs(city.lat) <= 90 &&
      Number.isFinite(city.lon) && Math.abs(city.lon) <= 180 &&
      typeof city.name === "string" && city.name.trim().length > 0 && city.name.length <= 200;
  }

  function cityOption(city) {
    const value = `${city.lat},${city.lon}`;
    let option = Array.from(els.locationSelect.options).find(opt => opt.value === value && opt.dataset.gps !== "true");
    if (!option) {
      option = new Option(city.name, value);
      option.dataset.name = city.name;
      option.dataset.saved = "true";
      els.locationSelect.add(option);
    }
    return option;
  }

  function savePreset() {
    if (state.isGps) return; // GPS座標は保存しない
    try {
      const cities = Array.from(els.locationSelect.options)
        .filter(opt => opt.dataset.saved === "true")
        .map(opt => {
          const [lat, lon] = opt.value.split(",").map(Number);
          return { lat, lon, name: opt.dataset.name };
        });
      localStorage.setItem(CITIES_KEY, JSON.stringify(cities));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat: state.lat, lon: state.lon, name: state.locationName }));
      els.storageStatus.textContent = "選択した都市を保存しました。次回もこの都市を表示します。";
    } catch (_) {
      els.storageStatus.textContent = "都市を保存できませんでした。ブラウザのストレージ設定を確認してください。";
    }
  }

  function restorePreset() {
    try {
      const cities = JSON.parse(localStorage.getItem(CITIES_KEY) || "[]");
      if (Array.isArray(cities)) cities.filter(validCity).slice(0, 100).forEach(cityOption);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!validCity(saved)) return;
      cityOption(saved).selected = true;
      state.lat = saved.lat;
      state.lon = saved.lon;
      state.locationName = saved.name;
    } catch (_) {} // 保存データが壊れていても既定の都市で起動
  }

  async function searchCities(event) {
    event.preventDefault();
    if (searchController) searchController.abort();
    const controller = new AbortController();
    searchController = controller;
    els.cityResults.replaceChildren();
    const query = els.cityQuery.value.normalize("NFKC").trim();
    if (query.length < 2) {
      els.searchStatus.textContent = "地名を2文字以上で入力してください。";
      return;
    }
    els.searchStatus.textContent = "検索中…";
    try {
      const cities = await WeatherAPI.searchCities(query, controller.signal);
      if (controller.signal.aborted) return;
      els.searchStatus.textContent = cities.length ? `${cities.length}件見つかりました。都市を選んでください。` :
        "都市が見つかりませんでした。「横浜市」のように市区町村名でお試しください。";
      cities.forEach(city => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = city.name;
        button.addEventListener("click", () => {
          cityOption(city).selected = true;
          onPresetChange({ target: els.locationSelect });
          els.cityResults.replaceChildren();
          els.searchStatus.textContent = `${city.name}を選択しました。`;
          els.locationSelect.focus();
        });
        li.append(button);
        els.cityResults.append(li);
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      els.searchStatus.textContent = "都市を検索できませんでした。通信状況を確認して、もう一度検索してください。";
    }
  }

  async function fetchData() {
    clearError();
    setLoading(true);
    els.title.textContent = "データ取得中...";

    if (state.abortController) state.abortController.abort();
    const controller = new AbortController();
    state.abortController = controller;

    try {
      const data = await WeatherAPI.fetchForecast(state.lat, state.lon, controller.signal);
      if (controller.signal.aborted) return;
      state.data = data;
      WeatherUI.applyBackground(state.data.current_weather.weathercode, state.data.current_weather.is_day);
      renderUI();
    } catch (error) {
      if (error.name !== "AbortError") {
        showError(error.message || "通信エラーが発生しました。ネットワーク接続を確認してください。");
      }
    } finally {
      if (state.abortController === controller) setLoading(false);
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
    state.isGps = option.dataset.gps === "true";
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
    els.searchForm.addEventListener("submit", searchCities);
    els.cityQuery.addEventListener("input", () => {
      if (searchController) searchController.abort();
      els.cityResults.replaceChildren();
      els.searchStatus.textContent = "";
    });
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
