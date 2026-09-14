Today Tomorrow Weather - 改善版

ファイル:
- index.html        画面構造
- styles.css        デザイン・レスポンシブ・アクセシビリティ
- weather-api.js    Open-Meteo取得・GPS逆ジオコーディング
- weather-ui.js     天気表示・色・UV判定・グラフ
- app.js            状態管理・イベント・描画

主な改善:
1. 風速をOpen-Meteo側で m/s 指定
2. GPS取得後に可能なら地名へ逆ジオコーディング
3. 今日の時間判定を完全な日時文字列で比較
4. 週間予報へ最大降水確率を追加
5. 今日・明日の時間別気温グラフを追加
6. 降水確率バーを確率別に色分け
7. UV指数へ「低い〜極端」の区分を追加
8. 晴れ・曇り・雨・雪・雷雨・夜の背景を追加
9. aria-label、タブ操作、キーボード操作、reduced-motion対応
10. エラー表示をカード化し再試行ボタンを追加。GPSエラーも原因別に表示
11. 最後に選んだプリセット地域をlocalStorageへ保存（GPS座標はプライバシー上保存しない）
12. HTML/CSS/API/UI/Appの5ファイルへ分割

使い方:
index.html をブラウザで開いてください。
ブラウザによっては位置情報取得が file:// では許可されません。その場合は localhost で配信してください。
例: このフォルダで `python -m http.server 8000` を実行し、http://localhost:8000/ を開きます。

外部サービス:
- 天気: Open-Meteo
- GPS地名化: BigDataCloud reverse-geocode-client（失敗時は「現在地」のまま動作）
