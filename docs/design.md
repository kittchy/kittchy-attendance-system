# Kittchy 勤怠管理システム 設計書

## 概要

個人用の勤怠管理デスクトップアプリケーション。ボタン1つで出勤・退勤・休憩を記録し、Slack通知と月次サマリー出力ができる。

## 技術スタック

| 項目 | 技術 |
|---|---|
| フレームワーク | Tauri v2 |
| バックエンド | Rust |
| フロントエンド | React + Vite + TypeScript |
| DB | SQLite (ローカル) |
| チャート | recharts |
| HTTP | reqwest (Slack webhook) |

## ディレクトリ構成

```
kittchy-attendance-system/
├── src-tauri/                    # Rust バックエンド (Tauri)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs               # エントリポイント (トレイ設定含む)
│       ├── lib.rs                 # Tauri app builder
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── attendance.rs      # 打刻系コマンド
│       │   ├── summary.rs         # 月次サマリー生成
│       │   └── settings.rs        # 設定 CRUD
│       ├── db/
│       │   ├── mod.rs
│       │   ├── migrations.rs      # マイグレーション定義
│       │   └── models.rs          # データ構造体
│       ├── slack.rs               # Slack webhook 送信
│       └── state.rs               # アプリ状態管理
│
├── frontend/                     # React フロントエンド
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/
│       │   └── index.ts
│       ├── hooks/
│       │   ├── useAttendance.ts
│       │   └── useSettings.ts
│       ├── components/
│       │   ├── ActionButton.tsx    # メイン打刻ボタン
│       │   ├── StatusBadge.tsx     # 勤務状態表示
│       │   ├── DailyChart.tsx      # 棒グラフ
│       │   ├── MonthlySummary.tsx  # 月次サマリー表示・コピー
│       │   └── SettingsDialog.tsx  # 設定ダイアログ
│       ├── pages/
│       │   ├── HomePage.tsx        # メイン画面
│       │   └── HistoryPage.tsx     # 履歴・グラフ・サマリー
│       └── lib/
│           ├── commands.ts         # Tauri invoke ラッパー
│           └── formatters.ts       # 時間フォーマット
│
└── docs/
    └── design.md                  # この設計書
```

---

## DB 設計

### stamp_events テーブル

打刻イベントをイベントソーシング方式で記録する。1操作 = 1行。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | 自動採番 |
| `event_type` | TEXT NOT NULL | `clock_in`, `clock_out`, `break_start`, `break_end` |
| `timestamp` | TEXT NOT NULL | ISO 8601 (`2026-03-26T09:00:00+09:00`) |
| `date_key` | TEXT NOT NULL | 勤務日キー `YYYY-MM-DD`（出勤日基準） |

**`date_key` のルール**: `clock_in` 時点の日付を勤務セッション全体の `date_key` とする。日跨ぎで `clock_out` が翌日になっても、`date_key` は出勤日のまま。

### settings テーブル

| カラム | 型 | 説明 |
|---|---|---|
| `key` | TEXT PRIMARY KEY | 設定キー |
| `value` | TEXT NOT NULL | 設定値 |

初期設定:
- `slack_webhook_url` - Slack Webhook URL
- `slack_clock_in_message` - 出勤メッセージ (デフォルト: `出勤しました`)
- `slack_clock_out_message` - 退勤メッセージ (デフォルト: `退勤しました`)

### マイグレーション SQL

```sql
CREATE TABLE IF NOT EXISTS stamp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL CHECK(event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
    timestamp TEXT NOT NULL,
    date_key TEXT NOT NULL
);

CREATE INDEX idx_stamp_events_date_key ON stamp_events(date_key);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## 状態遷移

勤務状態は DB のイベントから導出する（別途状態テーブルは持たない）。

```
                 clock_in                break_start
  [Idle] ──────────────────► [Working] ──────────────► [OnBreak]
    ▲                           │  ▲                      │
    │          clock_out        │  │     break_end         │
    └───────────────────────────┘  └──────────────────────┘
```

| 現在の状態 | 表示ボタン | 発行イベント | 遷移先 |
|---|---|---|---|
| Idle (未出勤) | 出勤 | `clock_in` | Working |
| Working (勤務中) | 休憩 / 退勤 | `break_start` / `clock_out` | OnBreak / Idle |
| OnBreak (休憩中) | 休憩終了 | `break_end` | Working |

---

## Tauri コマンド設計

### 打刻系

| コマンド | 引数 | 戻り値 | 説明 |
|---|---|---|---|
| `get_current_status` | なし | `{ status, clock_in_time? }` | 今日の状態を導出 |
| `stamp` | `{ event_type }` | `{ success, timestamp }` | 打刻記録 + Slack通知 |
| `get_today_events` | なし | `Vec<StampEvent>` | 本日のイベント一覧 |

### 履歴・サマリー系

| コマンド | 引数 | 戻り値 | 説明 |
|---|---|---|---|
| `get_daily_records` | `{ year, month }` | `Vec<DailyRecord>` | 月の日別勤務時間 (グラフ用) |
| `get_monthly_summary` | `{ year, month }` | `String` | 月次サマリーテキスト |

### 設定系

| コマンド | 引数 | 戻り値 | 説明 |
|---|---|---|---|
| `get_settings` | なし | `HashMap<String, String>` | 全設定取得 |
| `update_setting` | `{ key, value }` | `()` | 設定UPSERT |

---

## 月次サマリー生成ロジック

### 計算手順

1. 指定月の `date_key` でイベントをグループ化、`timestamp` 昇順ソート
2. 各グループ（= 1勤務日）:
   - 最初の `clock_in` → 出勤時刻
   - 最後の `clock_out` → 退勤時刻
   - `break_start` / `break_end` ペアから休憩時間を合算
   - 実労働時間 = (退勤 - 出勤) - 合計休憩時間

### 日跨ぎの扱い

`date_key` が出勤日基準のため、特別な処理は不要。`timestamp` は実際の日時を保持しているので、差分計算は正しく行われる。表示は `23:46:03-01:54:18` のようにそのまま出力。

### 出力フォーマット

```
- 2/10(Tue): 4時間26分 (16:00:00-20:26:00)
- 2/23(Mon): 8時間20分 (10:30:00-19:50:25 ※1時間0分の中抜け含む)

29時間54分
```

- 勤務がない日はスキップ
- 休憩 > 0分の場合のみ `※` 付きで中抜け時間を表示
- 最終行に月間合計時間

---

## Slack 通知

Rust 側で `reqwest` を使い webhook POST を送信。

- `clock_in` 時: 設定メッセージを送信
- `clock_out` 時: `退勤しました (本日の勤務時間: 8時間20分)` 形式
- 送信失敗時はログ記録のみ、ユーザー操作はブロックしない

---

## 画面設計

### HomePage (メイン画面)

```
┌──────────────────────────────┐
│  🟢 勤務中  09:00:00 から     │
│                              │
│  ┌────────┐  ┌────────┐     │
│  │ 休憩   │  │ 退勤   │     │
│  └────────┘  └────────┘     │
│                              │
│  本日の記録:                  │
│  09:00 出勤                  │
│  12:00 休憩開始              │
│  13:00 休憩終了              │
└──────────────────────────────┘
```

### HistoryPage (履歴画面)

```
┌──────────────────────────────┐
│  ◀ 2026年3月 ▶              │
│                              │
│  █████████  8h  3/25        │
│  ██████     6h  3/26        │
│  ████       3h  3/27        │
│                              │
│  合計: 17時間                │
│                              │
│  [サマリーをコピー]           │
│  ┌──────────────────────┐   │
│  │ - 3/25(Wed): 8時間...│   │
│  └──────────────────────┘   │
│                              │
│  ⚙ 設定                     │
└──────────────────────────────┘
```

---

## システムトレイ (メニューバー常駐)

macOS メニューバーに常駐。ウィンドウを閉じてもアプリは終了しない。

トレイメニュー:
- 出勤 / 退勤 / 休憩 / 休憩終了（状態に応じて有効/無効）
- ウィンドウを表示
- 終了

---

## 実装フェーズ

### Phase 1: MVP
1. Tauri + React プロジェクト初期化
2. DBテーブル作成
3. `stamp` / `get_current_status` コマンド
4. HomePage の打刻UI

### Phase 2: 通知と履歴
5. Slack通知
6. 設定画面
7. 棒グラフ表示

### Phase 3: サマリーとトレイ
8. 月次サマリー生成
9. クリップボードコピー
10. システムトレイ常駐

---

## 設計判断

| 判断 | 理由 |
|---|---|
| イベントソーシング方式 | データの信頼性が高く、計算ロジックを後から変更可能。個人利用ではデータ量が小さく性能問題なし |
| `date_key` を出勤日基準 | 日跨ぎ勤務を自然に扱える |
| Slack通知はRust側 | Webhook URLがフロントエンドに露出しない |
| recharts | React との親和性が高く軽量 |

---

## 主要依存ライブラリ

### Rust (Cargo)
- `tauri` v2 (tray-icon feature)
- `tauri-plugin-sql` (sqlite)
- `serde` / `serde_json`
- `reqwest` (json feature)
- `chrono` (serde feature)

### フロントエンド (npm)
- `react` / `react-dom`
- `@tauri-apps/api`
- `recharts`
- `typescript`
