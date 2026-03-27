use log;
use serde_json::json;

/// Slack Webhook にメッセージを送信する（非同期、失敗時はログのみ）
pub async fn send_slack_message(webhook_url: &str, message: &str) {
    if webhook_url.is_empty() || !webhook_url.starts_with("https://hooks.slack.com/") {
        if !webhook_url.is_empty() {
            log::warn!("無効なSlack Webhook URL: Slack公式URLのみ許可されます");
        }
        return;
    }

    let client = reqwest::Client::new();
    let payload = json!({ "text": message });

    match client.post(webhook_url).json(&payload).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                log::warn!("Slack通知失敗: status={}", resp.status());
            }
        }
        Err(e) => {
            log::warn!("Slack通知エラー: {}", e);
        }
    }
}
