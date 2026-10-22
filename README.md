# TRACE

**[テストプレイを開く](https://yuji5124.github.io/TRACE/)** — [公開構成・検証](docs/PAGES.md)

150m × 150m の公園・周辺市街地を探索する、Three.js / TypeScript / Vite の背景ワールド。

## 起動

Node.js 22.12以降（20系なら20.19以降）。

```sh
npm ci
npm run dev
npm run build
npm test
```

ブラウザで表示されたURLを開き「公園を歩く」を押します。
`?seed=104729` で生成seedを固定できます。`?seed=0` も有効です。

| 操作 | 内容 |
|---|---|
| WASD / 上下矢印 | 移動 |
| マウス / 左右矢印 | 視点 |
| Shift / RUNボタン | 走る（足音の範囲・頻度が増加） |
| 左クリック / FIRE | 射撃・35m音響パルス |
| Q / 音波ボタン | TEST音波 |
| M / 音量ボタン | 消音 / 音量設定 |
| F1 / 画面ボタン | 通常表示 |
| F2 / 画面ボタン | 透明世界＋SONIC VISION（HUD・衝突判定維持） |
| F3 / 画面ボタン | 実コライダーとオブジェクト境界 |
| P | 負荷計測 |
| R | 公園入口へ戻る |
| Esc | マウス解除・一時停止 |
| タッチ左側 / 右側 | 移動 / 視点 |

## 検証

```sh
npx playwright install chromium
npm run dev
# 別ターミナルで
npm run test:browser
```

`CHROMIUM_EXECUTABLE` で既存Chromiumを指定、`TRACE_URL` で検証URLを指定できます。
スクリーンショットと結果JSONは `artifacts/` に生成します。
`?test=1` のみQA用 `window.traceTest` が有効になります。

詳細は [制作・構造・参考調査](docs/PHASE1.md)、[動作確認結果](docs/VALIDATION.md)、
[第三者ライセンス](public/THIRD_PARTY_NOTICES.txt) を参照してください。

ソフトウェア描画でキャプチャが遅い環境では `TRACE_CAPTURE=0` で操作・衝突テストのみ実行できます。
`TRACE_ARTIFACT_DIR` で結果の保存先を変更できます。


## Phase 2A / 2B — SONIC VISION

「公園を歩く」で開始し、F2へ切り替え、**Qキーまたは音波ボタン**で音波を出します。
発生位置から波が広がり、元の建物・地面・樹木・階段・遊具の表面が到達順に浮かび、残光が消えます。
F1では背景に重ね描き、F3ではコライダーと波の半径・発生位置・経過時間を確認できます。

設定は `src/sonic/config.ts`：25m/s、最大35m、厚さ1.5m、残光1.2秒、最大8波。
速度は視覚表現用のゲーム内設定です。遮蔽・反射は未実装です。Phase 2Cで足音・銃声の実音を追加しています。

```sh
npm test
npm run build
# 開発サーバーまたはpreviewを起動した状態で
npm run test:sonic
```

SONIC VISIONのテストは、実際にコンパイルしたシェーダーをWebGLで描き、画素を読み戻して
壁の部分表示・到達順・残光消失を判定します。`TRACE_CAPTURE=0` で画像出力を省略できます。
`TRACE_SONIC_OUTPUT` で出力先を変更できます。

[Phase 2の設計・検証結果・比較画像・連続フレーム](docs/PHASE2.md)

## Phase 2C — SOUND ACTION

歩行4m、走行8m、着地10m、射撃35mの音響可視化。
足音は衝突解決後の実移動と連動し、停止中には発生しません。
生成したWeb Audio効果音、音量・ミュート、モバイルFIRE / RUNを追加。
全種別で最大8波、上限では最古を置換。Q音波と共存します。

```sh
# previewサーバーを起動して
npm run test:sound
```

[設計・検証結果・比較画像・実機未検証事項](docs/PHASE2C.md)

## Phase 3A — ECHO HUNTER

F2でQを鳴らすと、周囲だけでなく敵も浮かび、音源を調査しに来ます。
走ると速く逃げられますが、8m以内の敵へ足音が届きます。壁で視線を切り、静かに移動してください。
捕捉時は入口から再開。F3で状態・音源記憶・経路・AI時間を確認できます。

[状態遷移・検証結果・実機未検証事項](docs/PHASE3A.md) / `npm run test:hunter`

## Phase 3B — 視野と振り向き

敵に通常90度・警戒中110度の水平視野を追加。背後の静かな通過、音での振り向き、壁での視線遮断を試せます。
顔の突起が正面。F2では音波が届いた時だけ形状を確認でき、F3には視野コーンと視認理由を表示します。
接触は背後でも捕捉。足音は実移動速度に連動する既存仕様を維持しています。
[設計・検証・比較画像・制限](docs/PHASE3B.md)。実機での怖さ・公平さは試遊による評価待ちです。
