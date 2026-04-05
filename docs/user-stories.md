# ユーザストーリー & 作業計画 (Phase 4 & 5)

## ユーザストーリー

### US-1: 仕事の種類ごとに勤怠を分けたい

> ユーザとして、仕事の種類ごとに勤怠を分けたい。
> なぜなら、複数の仕事を掛け持ちしていて、勤怠管理をそれぞれ別に記録・集計したいからだ。

**受け入れ条件:**

- [x] 「ワークスペース」を作成・編集・削除できる（例: "本業", "副業A"）
- [x] 出勤時にどのワークスペースで打刻するか選択できる
- [x] 同時に複数ワークスペースで勤務はできない（1つを退勤してから別に出勤）
- [x] 履歴・グラフ・月次サマリーをワークスペースごとにフィルタできる
- [x] Slack設定（Webhook URL・メッセージ）はワークスペースごとに独立
- [x] ワークスペースが未作成の場合は従来通り（デフォルトワークスペース）で動作する

### US-2: 設定にすぐ辿り着きたい

> ユーザとして、設定にすぐ辿り着きたい。
> なぜなら、設定の情報を一目で確認し、すぐに修正したいからだ。

**受け入れ条件:**

- [x] HomePageから直接設定画面にアクセスできる（履歴ページを経由しない）
- [x] 各ワークスペースのSlack設定状態が一目でわかる（接続済み / 未設定）
- [x] ワークスペース管理も設定画面から行える

### US-3: メニューバーから直接打刻したい

> ユーザとして、macOSメニューバーから直接打刻したい。
> なぜなら、打刻のためだけにアプリウィンドウを開くのが面倒だからだ。
> アプリウィンドウでは統計情報とサマリーだけ見えれば良い。

**受け入れ条件:**

- [x] メニューバーのトレイアイコンから出勤・退勤・休憩開始・休憩終了ができる
- [x] トレイメニューに現在の勤務状態が表示される（例: "勤務中 - 本業"）
- [x] ワークスペースが複数ある場合、トレイのサブメニューで選択して出勤できる
- [x] アプリウィンドウからも打刻可能（補助的な位置づけとして残存）
- [x] トレイで打刻後、アプリウィンドウ側のデータも自動反映される

### US-4: 入力した勤怠を後から修正したい

> ユーザとして、入力した勤怠を後から修正したい。
> なぜなら、どうしても入力ミスなどが発生するからだ。

**受け入れ条件:**

- [x] 本日の記録セクションからイベントの時刻を修正できる（時刻をクリックしてインライン編集）
- [x] 誤って打刻したイベントを削除できる（確認ダイアログ付き）
- [x] 修正・削除後に勤務状態・トレイメニューが即座に反映される
- [x] イベント順序の整合性が保たれる（出勤→休憩開始→休憩終了→退勤の順序が壊れる修正はエラー）

---

## 現状の課題

| 課題 | 影響 |
|---|---|
| `stamp_events` にワークスペースの概念がない | 全打刻が単一の記録になり、仕事別の集計ができない |
| 設定画面が `HistoryPage → ⚙ 設定ボタン → モーダル` の2段階 | すぐにアクセスできない |
| トレイメニューは「ウィンドウを表示」と「終了」のみ | 打刻のためにウィンドウを開く必要がある |

---

## 設計方針

### アプリの役割の再定義

打刻の主操作はメニューバー（トレイ）で行い、アプリウィンドウは統計・設定の閲覧専用とする。
アプリウィンドウからの打刻ボタンは完全に削除する。

```
┌─────────────────────────────┐
│  メニューバー（トレイ）        │  ← 打刻の唯一の操作手段
│  - 勤務状態の表示             │
│  - 出勤 / 退勤 / 休憩        │
│  - ワークスペース選択          │
├─────────────────────────────┤
│  アプリウィンドウ             │  ← 閲覧・設定専用
│  - 本日の勤務状態             │
│  - 統計グラフ                │
│  - 月次サマリー              │
│  - 設定                     │
└─────────────────────────────┘
```

### 制約: 同時勤務不可

1つのワークスペースを退勤してから、別のワークスペースに出勤する。
同時に複数ワークスペースで勤務中になることはない。

### トレイメニュー構成

```
● 勤務中 - 本業 (09:00〜)        ← 状態表示（disabled、太字）
──────────────────────
退勤                            ← 現在の状態に応じたアクション
休憩
──────────────────────
出勤 ▶ 本業                     ← ワークスペース2つ以上: サブメニュー
       副業A                       1つの場合: 「出勤」のみ（サブメニューなし）
──────────────────────
ウィンドウを表示
終了
```

Idle状態の場合:
```
○ 未出勤
──────────────────────
出勤 ▶ 本業
       副業A
──────────────────────
ウィンドウを表示
終了
```

### ワークスペース

- `workspaces` テーブルを新設し、`stamp_events` に `workspace_id` カラムを追加
- デフォルトワークスペース（id=1, name="デフォルト"）を自動作成し、既存データとの後方互換を保つ
- トレイメニューからワークスペースを選んで出勤

### 設定アクセス

- HomePageのヘッダーに歯車アイコンを配置
- 設定画面をページとして独立させ、Slack設定 + ワークスペース管理を統合

### アプリウィンドウの簡素化

- HomePageの打刻ボタンは残すが、補助的な位置づけ
- メイン画面に本日の状態サマリー + 履歴グラフをまとめて表示

---

## DB変更

```sql
-- ワークスペーステーブル（Slack設定もワークスペースに紐づく）
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    slack_webhook_url TEXT NOT NULL DEFAULT '',
    slack_clock_in_message TEXT NOT NULL DEFAULT '出勤しました',
    slack_clock_out_message TEXT NOT NULL DEFAULT '退勤しました',
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- デフォルトワークスペース（既存のsettingsテーブルの値をマイグレーション）
INSERT OR IGNORE INTO workspaces (id, name, color, sort_order) VALUES (1, 'デフォルト', '#3b82f6', 0);

-- stamp_events に workspace_id を追加（既存データはデフォルト=1）
ALTER TABLE stamp_events ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id);
```

**マイグレーション時の注意:** 既存の `settings` テーブルの `slack_webhook_url` 等をデフォルトワークスペースに移行する。`settings` テーブルはSlack以外の設定用に残す。

---

## 実装フェーズ

### Phase 4a: 設定アクセス改善 + アプリUI再構成 (US-2, US-3の一部)

アプリウィンドウを統計・設定専用に再構成し、設定へのアクセスを改善する。

**タスク:**

1. HomePageから打刻ボタン（ActionButton）を削除し、本日の勤務状態表示 + 本日の記録のみに
2. HomePageに設定アイコンを追加（ヘッダー右上に ⚙ ボタン）
3. `SettingsPage` を新規作成（モーダルではなく独立ページ）
   - Slack設定セクション（Webhook URL, メッセージ）
   - 接続状態インジケータ（URL設定済み → 緑、未設定 → グレー）
4. `App.tsx` にページ遷移を追加（home / history / settings）
5. HistoryPage の設定ボタンも SettingsPage への遷移に変更

**影響ファイル:**

| ファイル | 変更内容 |
|---|---|
| `frontend/src/App.tsx` | "settings" ページ追加 |
| `frontend/src/pages/HomePage.tsx` | 打刻ボタン削除、設定アイコン追加 |
| `frontend/src/pages/SettingsPage.tsx` | 新規作成 |
| `frontend/src/pages/HistoryPage.tsx` | 設定ボタンをページ遷移に変更 |
| `frontend/src/components/ActionButton.tsx` | 削除（トレイに移行するため） |
| `frontend/src/components/SettingsDialog.tsx` | 削除（SettingsPageに統合） |

### Phase 4b: ワークスペース対応 (US-1)

**タスク:**

1. DBマイグレーション（workspacesテーブル + stamp_eventsにworkspace_id追加）
2. ワークスペースCRUDコマンド（create / update / delete / list）
3. `stamp` コマンドに `workspace_id` 引数を追加
4. `get_current_status` / `get_today_events` にワークスペースフィルタ追加
5. `get_daily_records` / `get_monthly_summary` にワークスペースフィルタ追加
6. 出勤時のワークスペース選択UI（HomePageにセレクター表示）
7. 履歴ページにワークスペースフィルタ追加
8. SettingsPage にワークスペース管理セクション追加（追加・編集・削除）
9. Slack通知をワークスペース単位に変更（各WSのwebhook URLで送信、メッセージにWS名を含む）
10. 既存settingsテーブルのSlack設定をデフォルトワークスペースにマイグレーション

**影響ファイル:**

| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/db/migrations.rs` | workspacesテーブル + ALTER TABLE追加 |
| `src-tauri/src/db/models.rs` | Workspace構造体追加 |
| `src-tauri/src/commands/workspace.rs` | 新規: CRUD コマンド |
| `src-tauri/src/commands/attendance.rs` | stamp / get_current_status にworkspace_id追加 |
| `src-tauri/src/commands/summary.rs` | フィルタ条件追加 |
| `src-tauri/src/lib.rs` | ワークスペースコマンド登録 |
| `frontend/src/types/index.ts` | Workspace型追加 |
| `frontend/src/lib/commands.ts` | ワークスペース系API追加 |
| `frontend/src/pages/HomePage.tsx` | ワークスペースセレクター |
| `frontend/src/pages/HistoryPage.tsx` | フィルタUI |
| `frontend/src/pages/SettingsPage.tsx` | ワークスペース管理セクション |
| `frontend/src/hooks/useAttendance.ts` | workspace_id対応 |

### Phase 4c: トレイから打刻 (US-3)

Phase 4b（ワークスペース）完了後に実施。トレイメニューの動的構築が必要。

**タスク:**

1. トレイメニューを動的に構築する関数を作成
   - 現在の勤務状態に応じてメニュー項目を有効/無効に切り替え
   - ワークスペース一覧をサブメニューとして表示
2. トレイメニューのイベントハンドラで `stamp` コマンドを実行
3. 打刻後にトレイメニューを再構築（状態を反映）
4. トレイアイコンのツールチップに現在の状態を表示
5. フロントエンドから打刻された場合もトレイメニューを更新（イベント連携）

**影響ファイル:**

| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/lib.rs` | トレイ構築ロジック大幅変更 |
| `src-tauri/src/commands/attendance.rs` | 打刻後にトレイメニュー再構築イベント発行 |

**技術的なポイント:**

- Tauri v2 では `TrayIcon::set_menu()` でメニューを動的に差し替え可能
- 打刻操作はRust側で直接DB操作（フロントエンドを経由しない）
- 打刻後にフロントエンドへ `tauri::Emitter::emit()` でイベント通知し、UI更新

---

## 実装順序の理由

```
Phase 4a (設定改善)  ← 単独で完結、基盤整備
    ↓
Phase 4b (ワークスペース) ← DB変更 + 全コマンド影響、4cの前提
    ↓
Phase 4c (トレイ打刻)  ← ワークスペース対応済みのトレイメニュー構築
```

- 4a → 4b: 設定ページがワークスペース管理の受け皿になる
- 4b → 4c: トレイメニューにワークスペース一覧を出すため、4bが先

---

## 検証方法

- Phase 4a: HomePage から設定ページへの遷移を確認。Slack設定の保存・表示を確認
- Phase 4b:
  - ワークスペースを2つ作成し、それぞれで出勤→退勤
  - 履歴ページでフィルタ切り替えし、グラフ・サマリーが正しく分離されることを確認
  - Slack通知にワークスペース名が含まれることを確認
  - ワークスペースが1つだけの場合、出勤時に選択UIが出ないことを確認
- Phase 4c:
  - トレイメニューから出勤→休憩→休憩終了→退勤の一連操作を実行
  - 操作後にトレイメニューの状態表示が即座に更新されることを確認
  - ワークスペース2つの場合、サブメニューから選んで出勤できることを確認
  - トレイから打刻後、アプリウィンドウを開いた時にデータが反映されていることを確認

---

## Phase 5: 勤怠データ修正 (US-4)

### 設計方針

イベントソーシングだが個人用アプリのため、イベントの直接 UPDATE / DELETE で実装する。
補正イベント方式は過剰なため採用しない。

修正時にはイベント順序の整合性を検証し、矛盾する変更を防ぐ。

### タスク

1. `attendance.rs` に `validate_event_order` 関数を追加（同セッション内の全イベントの順序整合性を検証）
2. `attendance.rs` に `update_event` コマンドを追加（時刻修正 + 順序検証 + トレイ更新通知）
3. `attendance.rs` に `delete_event` コマンドを追加（削除 + 順序検証 + トレイ更新通知）
4. `lib.rs` の `invoke_handler` に2コマンドを登録
5. `commands.ts` に `updateEvent` / `deleteEvent` ラッパー追加
6. `useAttendance.ts` に `doUpdateEvent` / `doDeleteEvent` 追加
7. `formatters.ts` に時刻変換ヘルパー追加
8. `EventRow.tsx` を新規作成（インライン編集・削除UI）
9. `HomePage.tsx` でイベント一覧を `EventRow` に置き換え

### 影響ファイル

| ファイル | 変更内容 |
|---|---|
| `src-tauri/src/commands/attendance.rs` | update_event, delete_event, validate_event_order 追加 |
| `src-tauri/src/lib.rs` | invoke_handler に2コマンド登録 |
| `frontend/src/components/EventRow.tsx` | 新規: インライン編集・削除UIコンポーネント |
| `frontend/src/pages/HomePage.tsx` | EventRow に置き換え |
| `frontend/src/hooks/useAttendance.ts` | doUpdateEvent, doDeleteEvent 追加 |
| `frontend/src/lib/commands.ts` | updateEvent, deleteEvent ラッパー追加 |
| `frontend/src/lib/formatters.ts` | 時刻変換ヘルパー追加 |

### 検証方法

- 出勤→休憩→休憩終了→退勤を打刻し、各時刻を修正できることを確認
- 順序が壊れる修正（退勤を出勤より前にする等）がエラーになることを確認
- イベント削除後に状態・トレイメニューが正しく更新されることを確認
- clock_in の削除がセッション内に他イベントがある場合に拒否されることを確認
