# TRACE

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
| Shift | 走る |
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
速度は視覚表現用のゲーム内設定です。遮蔽・反射・実音の再生はこの段階では実装していません。

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
