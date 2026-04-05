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
│       ├── lib.rs                 # Tauri app builder + トレイ打刻ロジック
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── attendance.rs      # 打刻系コマンド (update_event, delete_event 含む)
│       │   ├── workspace.rs       # ワークスペース CRUD コマンド
│       │   ├── summary.rs         # 月次サマリー生成
│       │   └── settings.rs        # 設定 CRUD
│       ├── db/
│       │   ├── mod.rs
│       │   ├── migrations.rs      # マイグレーション定義 (workspaces テーブル含む)
│       │   └── models.rs          # データ構造体 (Workspace 含む)
│       ├── slack.rs               # Slack webhook 送信
│       └── state.rs               # アプリ状態管理
│
├── frontend/                     # React フロントエンド
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                # ページ遷移 (home / history / settings)
│       ├── types/
│       │   └── index.ts           # Workspace 型含む
│       ├── hooks/
│       │   ├── useAttendance.ts   # workspace_id 対応、doUpdateEvent / doDeleteEvent 含む
│       │   └── useSettings.ts
│       ├── components/
│       │   ├── ActionButton.tsx    # 打刻ボタン（補助的）
│       │   ├── EventRow.tsx        # インライン編集・削除UI
│       │   ├── StatusBadge.tsx     # 勤務状態表示
│       │   ├── DailyChart.tsx      # 棒グラフ
│       │   └── MonthlySummary.tsx  # 月次サマリー表示・コピー
│       ├── pages/
│       │   ├── HomePage.tsx        # メイン画面 (ワークスペースセレクター含む)
│       │   ├── HistoryPage.tsx     # 履歴・グラフ・サマリー (WSフィルタ含む)
│       │   └── SettingsPage.tsx    # 設定画面 (Slack設定 + WS管理)
│       └── lib/
│           ├── commands.ts         # Tauri invoke ラッパー (WS系 / updateEvent / deleteEvent 含む)
│           └── formatters.ts       # 時間フォーマット + 時刻変換ヘルパー
│
└── docs/
    ├── design.md                  # この設計書
    └── user-stories.md            # ユーザストーリー & 作業計画
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
| `workspace_id` | INTEGER NOT NULL DEFAULT 1 | ワークスペースID（workspaces.id への外部キー） |

**`date_key` のルール**: `clock_in` 時点の日付を勤務セッション全体の `date_key` とする。日跨ぎで `clock_out` が翌日になっても、`date_key` は出勤日のまま。

### workspaces テーブル

ワークスペース（仕事の種類）を管理する。Slack設定もワークスペースに紐づく。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | 自動採番 |
| `name` | TEXT NOT NULL | ワークスペース名（例: "本業", "副業A"） |
| `color` | TEXT NOT NULL DEFAULT '#3b82f6' | 表示色 |
| `slack_webhook_url` | TEXT NOT NULL DEFAULT '' | Slack Webhook URL |
| `slack_clock_in_message` | TEXT NOT NULL DEFAULT '出勤しました' | 出勤メッセージ |
| `slack_clock_out_message` | TEXT NOT NULL DEFAULT '退勤しました' | 退勤メッセージ |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | 表示順 |

デフォルトワークスペース（id=1, name="デフォルト"）が自動作成される。

### settings テーブル

| カラム | 型 | 説明 |
|---|---|---|
| `key` | TEXT PRIMARY KEY | 設定キー |
| `value` | TEXT NOT NULL | 設定値 |

Slack設定はワークスペースに移行済み。settings テーブルはSlack以外の設定用に残存。

### マイグレーション SQL

```sql
CREATE TABLE IF NOT EXISTS stamp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL CHECK(event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
    timestamp TEXT NOT NULL,
    date_key TEXT NOT NULL,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id)
);

CREATE INDEX idx_stamp_events_date_key ON stamp_events(date_key);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    slack_webhook_url TEXT NOT NULL DEFAULT '',
    slack_clock_in_message TEXT NOT NULL DEFAULT '出勤しました',
    slack_clock_out_message TEXT NOT NULL DEFAULT '退勤しました',
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO workspaces (id, name, color, sort_order) VALUES (1, 'デフォルト', '#3b82f6', 0);
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
| `get_current_status` | `{ workspace_id? }` | `{ status, clock_in_time? }` | 今日の状態を導出 |
| `stamp` | `{ event_type, workspace_id? }` | `{ success, timestamp }` | 打刻記録 + Slack通知 |
| `get_today_events` | `{ workspace_id? }` | `Vec<StampEvent>` | 本日のイベント一覧 |
| `update_event` | `{ event_id, new_timestamp }` | `()` | イベント時刻修正（順序検証付き） |
| `delete_event` | `{ event_id }` | `()` | イベント削除（順序検証付き） |

### 履歴・サマリー系

| コマンド | 引数 | 戻り値 | 説明 |
|---|---|---|---|
| `get_daily_records` | `{ year, month, workspace_id? }` | `Vec<DailyRecord>` | 月の日別勤務時間 (グラフ用) |
| `get_monthly_summary` | `{ year, month, workspace_id? }` | `String` | 月次サマリーテキスト |

### ワークスペース系

| コマンド | 引数 | 戻り値 | 説明 |
|---|---|---|---|
| `list_workspaces` | なし | `Vec<Workspace>` | 全ワークスペース取得 |
| `create_workspace` | `{ name, color? }` | `Workspace` | ワークスペース作成 |
| `update_workspace` | `{ id, name?, color?, slack_*? }` | `()` | ワークスペース更新 |
| `delete_workspace` | `{ id }` | `()` | ワークスペース削除 |

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
**トレイは打刻の主要操作手段**であり、アプリウィンドウの打刻ボタンは補助的な位置づけ。

トレイメニュー（動的構築）:
- 勤務状態の表示（例: "● 勤務中 - 本業 (09:00〜)"）
- 出勤（ワークスペース2つ以上の場合はサブメニューで選択）
- 退勤 / 休憩 / 休憩終了（状態に応じて有効/無効）
- ウィンドウを表示
- 終了

打刻後にトレイメニューを再構築し、フロントエンドへイベント通知（`tauri::Emitter::emit()`）でUI更新。

---

## 実装フェーズ

### Phase 1: MVP ✅
1. Tauri + React プロジェクト初期化
2. DBテーブル作成
3. `stamp` / `get_current_status` コマンド
4. HomePage の打刻UI

### Phase 2: 通知と履歴 ✅
5. Slack通知
6. 設定画面
7. 棒グラフ表示

### Phase 3: サマリーとトレイ ✅
8. 月次サマリー生成
9. クリップボードコピー
10. システムトレイ常駐

### Phase 4a: 設定アクセス改善 + アプリUI再構成 ✅
11. HomePageに設定アイコン追加
12. SettingsPage を独立ページとして新規作成
13. ページ遷移の追加（home / history / settings）

### Phase 4b: ワークスペース対応 ✅
14. DBマイグレーション（workspacesテーブル + stamp_eventsにworkspace_id追加）
15. ワークスペースCRUDコマンド
16. 全コマンドにworkspace_idフィルタ追加
17. フロントエンドのワークスペースセレクター・フィルタUI
18. Slack通知のワークスペース単位化

### Phase 4c: トレイから打刻 ✅
19. トレイメニューの動的構築（状態に応じたメニュー項目制御）
20. トレイからの打刻実行 + メニュー再構築
21. ワークスペース別サブメニュー対応
22. フロントエンドとのイベント連携

### Phase 5: 勤怠データ修正 ✅
23. `update_event` / `delete_event` コマンド（順序検証付き）
24. EventRow コンポーネント（インライン編集・削除UI）
25. 修正・削除後の勤務状態・トレイメニュー即時反映

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
