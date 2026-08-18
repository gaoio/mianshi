use std::{collections::HashSet, sync::OnceLock};
use tauri::Manager;

pub const SOURCE_WINDOW_LABEL: &str = "source-viewer";
pub const TRUSTED_GITHUB_PATHS: &[&str] =
    &["/pgvector/pgvector", "/standard-webhooks/standard-webhooks"];

pub fn trusted_source_hosts() -> &'static HashSet<String> {
    static HOSTS: OnceLock<HashSet<String>> = OnceLock::new();
    HOSTS.get_or_init(|| {
        serde_json::from_str::<Vec<String>>(include_str!("../../src/lib/trustedSourceHosts.json"))
            .expect("trusted source hosts must be valid JSON")
            .into_iter()
            .collect()
    })
}

fn is_trusted_source_location(url: &tauri::Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    if !trusted_source_hosts().contains(host) {
        return false;
    }
    if host != "github.com" {
        return true;
    }
    TRUSTED_GITHUB_PATHS
        .iter()
        .any(|prefix| url.path() == *prefix || url.path().starts_with(&format!("{prefix}/")))
}

pub fn source_window_title(url: &tauri::Url) -> String {
    format!("官方来源 · {}", url.host_str().unwrap_or("未知地址"))
}

pub fn validate_source_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "来源地址无效".to_string())?;
    let host = url.host_str();
    if url.scheme() != "https"
        || host.is_none()
        || !is_trusted_source_location(&url)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("仅支持安全的 HTTPS 来源地址".to_string());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_source_window(
    app: tauri::AppHandle,
    current_window: tauri::WebviewWindow,
    url: String,
) -> Result<(), String> {
    let source_url = validate_source_url(&url)?;
    let title = source_window_title(&source_url);

    if let Some(window) = app.get_webview_window(SOURCE_WINDOW_LABEL) {
        window
            .navigate(source_url)
            .map_err(|error| format!("无法加载来源：{error}"))?;

        #[cfg(desktop)]
        {
            window
                .set_title(&title)
                .map_err(|error| format!("无法更新来源窗口标题：{error}"))?;
            window
                .show()
                .map_err(|error| format!("无法显示来源窗口：{error}"))?;
            window
                .set_focus()
                .map_err(|error| format!("无法聚焦来源窗口：{error}"))?;
        }
        return Ok(());
    }

    // Build from the invoking window so Android places SourceActivity on the
    // same activity stack and iOS inherits the requesting scene.
    let builder = tauri::WebviewWindowBuilder::new(
        &current_window,
        SOURCE_WINDOW_LABEL,
        tauri::WebviewUrl::External(source_url),
    )
    .title(title)
    .on_navigation(|next_url| validate_source_url(next_url.as_str()).is_ok())
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
    .on_download(|_, _| false)
    .on_page_load(|window, payload| {
        let _ = window.set_title(&source_window_title(payload.url()));
    });

    #[cfg(desktop)]
    let builder = builder
        .inner_size(1100.0, 760.0)
        .min_inner_size(640.0, 480.0)
        .resizable(true)
        .center();

    #[cfg(target_os = "android")]
    let builder = builder.activity_name("SourceActivity");

    let window = builder
        .build()
        .map_err(|error| format!("无法创建来源窗口：{error}"))?;

    #[cfg(desktop)]
    {
        window
            .set_focus()
            .map_err(|error| format!("无法聚焦来源窗口：{error}"))?;
    }

    #[cfg(mobile)]
    let _ = window;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_source_url;

    #[test]
    fn source_url_accepts_https_documents() {
        let url = validate_source_url("https://rocketmq.apache.org/docs/").unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("rocketmq.apache.org"));
    }

    #[test]
    fn source_url_rejects_unsafe_or_malformed_values() {
        for value in [
            "http://example.com/docs",
            "javascript:alert(1)",
            "file:///tmp/source.html",
            "https://user:password@example.com/docs",
            "https://example.com/docs",
            "https://go.dev:8443/doc/",
            "https://github.com/untrusted/example",
            "not a url",
        ] {
            assert!(validate_source_url(value).is_err(), "accepted {value}");
        }
    }
}
