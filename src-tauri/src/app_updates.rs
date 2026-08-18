use serde::Serialize;
use tauri::{AppHandle, Url};
use tauri_plugin_opener::OpenerExt;

#[cfg(desktop)]
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[cfg(desktop)]
const UPDATE_ENDPOINT: Option<&str> = option_env!("MIANSHI_UPDATE_ENDPOINT");
#[cfg(target_os = "android")]
const ANDROID_UPDATE_ENDPOINT: Option<&str> = option_env!("MIANSHI_ANDROID_UPDATE_ENDPOINT");
#[cfg(desktop)]
const UPDATER_PUBKEY: Option<&str> = option_env!("MIANSHI_UPDATER_PUBKEY");
const RELEASE_URL: Option<&str> = option_env!("MIANSHI_RELEASE_URL");

#[cfg(desktop)]
static INSTALLING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    configured: bool,
    current_version: String,
    platform: &'static str,
    can_install_in_app: bool,
    available: bool,
    latest_version: Option<String>,
    notes: Option<String>,
    release_url: Option<String>,
    download_url: Option<String>,
}

#[cfg(desktop)]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateProgress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
    percent: Option<u8>,
}

#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AndroidUpdateManifest {
    version: String,
    notes: Option<String>,
    download_url: String,
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn parse_github_url(value: &str, label: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| format!("{label}格式无效"))?;
    if url.scheme() != "https" || url.host_str() != Some("github.com") {
        return Err(format!("{label}必须使用 github.com 的 HTTPS 地址"));
    }
    Ok(url)
}

fn repository_identity(url: &Url) -> Result<(String, String), String> {
    let segments = url
        .path_segments()
        .ok_or_else(|| "GitHub 地址缺少仓库路径".to_string())?
        .filter(|segment| !segment.is_empty())
        .take(2)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if segments.len() != 2 {
        return Err("GitHub 地址缺少仓库路径".to_string());
    }
    Ok((segments[0].clone(), segments[1].clone()))
}

fn release_url() -> Result<Url, String> {
    let value = RELEASE_URL
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "当前构建未配置发布地址".to_string())?;
    let url = parse_github_url(value, "发布地址")?;
    if !url.path().contains("/releases") {
        return Err("发布地址必须指向 GitHub Releases".to_string());
    }
    repository_identity(&url)?;
    Ok(url)
}

fn endpoint_from(value: Option<&str>, label: &str) -> Result<Url, String> {
    let value = value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("当前构建未配置{label}"))?;
    let endpoint = parse_github_url(value, label)?;
    let release = release_url()?;
    if repository_identity(&endpoint)? != repository_identity(&release)? {
        return Err(format!("{label}与发布地址必须属于同一 GitHub 仓库"));
    }
    Ok(endpoint)
}

#[cfg(desktop)]
fn desktop_config() -> Result<(Url, &'static str), String> {
    let endpoint = endpoint_from(UPDATE_ENDPOINT, "桌面更新源")?;
    let pubkey = UPDATER_PUBKEY
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "当前构建未配置更新签名公钥".to_string())?;
    Ok((endpoint, pubkey))
}

#[cfg(target_os = "android")]
fn android_config() -> Result<Url, String> {
    endpoint_from(ANDROID_UPDATE_ENDPOINT, "Android 更新源")
}

fn base_info(app: &AppHandle) -> AppUpdateInfo {
    #[cfg(desktop)]
    let configured = desktop_config().is_ok();
    #[cfg(target_os = "android")]
    let configured = android_config().is_ok();
    #[cfg(all(not(desktop), not(target_os = "android")))]
    let configured = false;

    AppUpdateInfo {
        configured,
        current_version: app.package_info().version.to_string(),
        platform: platform_name(),
        can_install_in_app: cfg!(desktop),
        available: false,
        latest_version: None,
        notes: None,
        release_url: release_url().ok().map(|url| url.to_string()),
        download_url: None,
    }
}

#[tauri::command]
pub fn get_app_update_status(app: AppHandle) -> AppUpdateInfo {
    base_info(&app)
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<AppUpdateInfo, String> {
    #[cfg(desktop)]
    {
        let (endpoint, pubkey) = desktop_config()?;
        let updater = app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|error| format!("更新源配置失败：{error}"))?
            .pubkey(pubkey)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|error| format!("更新器初始化失败：{error}"))?;
        let update = updater
            .check()
            .await
            .map_err(|error| format!("检查更新失败：{error}"))?;
        let mut info = base_info(&app);
        if let Some(update) = update {
            info.available = true;
            info.latest_version = Some(update.version);
            info.notes = update.body.map(|body| body.chars().take(10_000).collect());
        }
        Ok(info)
    }

    #[cfg(target_os = "android")]
    {
        use semver::Version;
        use std::time::Duration;

        const MAX_MANIFEST_BYTES: u64 = 128 * 1024;
        let endpoint = android_config()?;
        let response = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|error| format!("更新检查初始化失败：{error}"))?
            .get(endpoint)
            .send()
            .await
            .map_err(|error| format!("检查更新失败：{error}"))?
            .error_for_status()
            .map_err(|error| format!("更新服务返回异常：{error}"))?;
        if response.content_length().unwrap_or(0) > MAX_MANIFEST_BYTES {
            return Err("更新清单体积异常".to_string());
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("读取更新清单失败：{error}"))?;
        if bytes.len() as u64 > MAX_MANIFEST_BYTES {
            return Err("更新清单体积异常".to_string());
        }
        let manifest: AndroidUpdateManifest = serde_json::from_slice(&bytes)
            .map_err(|error| format!("更新清单格式无效：{error}"))?;
        let current = Version::parse(&app.package_info().version.to_string())
            .map_err(|error| format!("当前版本号无效：{error}"))?;
        let latest = Version::parse(manifest.version.trim_start_matches('v'))
            .map_err(|error| format!("远程版本号无效：{error}"))?;
        let download = parse_github_url(&manifest.download_url, "Android 下载地址")?;
        let release = release_url()?;
        if repository_identity(&download)? != repository_identity(&release)?
            || !download.path().contains("/releases/download/")
            || !download.path().ends_with(".apk")
        {
            return Err("Android 下载地址不属于当前应用的 GitHub Release".to_string());
        }

        let mut info = base_info(&app);
        info.available = latest > current;
        info.latest_version = Some(latest.to_string());
        info.notes = manifest
            .notes
            .map(|notes| notes.chars().take(10_000).collect());
        if info.available {
            info.download_url = Some(download.to_string());
        }
        Ok(info)
    }

    #[cfg(all(not(desktop), not(target_os = "android")))]
    {
        let _ = app;
        Err("当前平台暂不支持在线更新".to_string())
    }
}

#[cfg(desktop)]
struct InstallGuard;

#[cfg(desktop)]
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if INSTALLING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err("更新正在安装，请勿重复操作".to_string());
        }
        let _guard = InstallGuard;
        let (endpoint, pubkey) = desktop_config()?;
        let update = app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|error| format!("更新源配置失败：{error}"))?
            .pubkey(pubkey)
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|error| format!("更新器初始化失败：{error}"))?
            .check()
            .await
            .map_err(|error| format!("检查更新失败：{error}"))?
            .ok_or_else(|| "当前已经是最新版本".to_string())?;

        let progress_app = app.clone();
        let finish_app = app.clone();
        let mut downloaded = 0_u64;
        update
            .download_and_install(
                move |chunk_length, total| {
                    downloaded = downloaded.saturating_add(chunk_length as u64);
                    let percent = total
                        .filter(|total| *total > 0)
                        .map(|total| ((downloaded.saturating_mul(100) / total).min(100)) as u8);
                    let _ = progress_app.emit(
                        "app-update-progress",
                        AppUpdateProgress {
                            phase: "downloading",
                            downloaded,
                            total,
                            percent,
                        },
                    );
                },
                move || {
                    let _ = finish_app.emit(
                        "app-update-progress",
                        AppUpdateProgress {
                            phase: "installing",
                            downloaded: 0,
                            total: None,
                            percent: Some(100),
                        },
                    );
                },
            )
            .await
            .map_err(|error| format!("下载或安装更新失败：{error}"))?;
        app.restart()
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("移动端更新需要由系统安装器确认".to_string())
    }
}

#[tauri::command]
pub fn open_app_release_page(app: AppHandle) -> Result<(), String> {
    let url = release_url()?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| format!("打开发布页失败：{error}"))
}

#[tauri::command]
pub fn open_android_update(app: AppHandle, url: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let download = parse_github_url(&url, "Android 下载地址")?;
        let release = release_url()?;
        if repository_identity(&download)? != repository_identity(&release)?
            || !download.path().contains("/releases/download/")
            || !download.path().ends_with(".apk")
        {
            return Err("拒绝打开未经信任的安装包地址".to_string());
        }
        app.opener()
            .open_url(download.as_str(), None::<&str>)
            .map_err(|error| format!("打开安装包失败：{error}"))
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, url);
        Err("当前平台不使用 Android 安装包".to_string())
    }
}
