use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileEntry>,
}

fn project_path(root: &str, relative: &str) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let root = std::fs::canonicalize(root).map_err(|e| format!("Invalid project folder: {}", e))?;
    let rel = Path::new(relative);
    if rel.as_os_str().is_empty() || rel.is_absolute() || rel.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return Err("File path must be a relative path inside the project folder".into());
    }
    let target = root.join(rel);
    Ok((root, target))
}

/// Read a file and return its contents as a string
#[tauri::command]
fn read_project_file(root: String, path: String) -> Result<Option<String>, String> {
    let (root, target) = project_path(&root, &path)?;
    let canonical = match std::fs::canonicalize(&target) {
        Ok(path) => path,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Failed to read file: {}", e)),
    };
    if !canonical.starts_with(&root) { return Err("File path escapes the project folder".into()); }
    std::fs::read_to_string(canonical).map(Some).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write content to a file (creates parent directories if needed)
#[tauri::command]
fn write_project_file(root: String, path: String, content: String) -> Result<(), String> {
    let (root, target) = project_path(&root, &path)?;
    if let Some(parent) = target.parent() {
        let relative_parent = parent.strip_prefix(&root).map_err(|_| "File path escapes the project folder")?;
        let mut current = root.clone();
        for component in relative_parent.components() {
            current.push(component);
            match std::fs::symlink_metadata(&current) {
                Ok(metadata) if metadata.file_type().is_symlink() => return Err("Symbolic links are not allowed in project file paths".into()),
                Ok(metadata) if !metadata.is_dir() => return Err("A parent path component is not a directory".into()),
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => std::fs::create_dir(&current)
                    .map_err(|e| format!("Failed to create directory: {}", e))?,
                Err(e) => return Err(format!("Invalid parent directory: {}", e)),
            }
        }
        let canonical_parent = std::fs::canonicalize(parent).map_err(|e| format!("Invalid parent directory: {}", e))?;
        if !canonical_parent.starts_with(&root) { return Err("File path escapes the project folder".into()); }
    }
    match std::fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.file_type().is_symlink() => return Err("Symbolic links are not allowed in project file paths".into()),
        Ok(_) => {
            let canonical = std::fs::canonicalize(&target).map_err(|e| format!("Invalid file path: {}", e))?;
            if !canonical.starts_with(&root) { return Err("File path escapes the project folder".into()); }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Invalid file path: {}", e)),
    }
    std::fs::write(&target, &content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Delete a file or empty directory
#[tauri::command]
fn delete_project_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir(p).map_err(|e| format!("Failed to remove directory: {}", e))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("Failed to remove file: {}", e))
    }
}

/// Recursively build a file tree from a directory path
fn build_tree(dir: &Path, base: &Path) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let ignore = ["node_modules", ".git", "target", "dist", ".next", "__pycache__", ".vscode", "build"];

    if let Ok(read_dir) = std::fs::read_dir(dir) {
        let mut items: Vec<_> = read_dir
            .filter_map(|e| e.ok())
            .filter(|e| {
                let fname = e.file_name().to_string_lossy().to_string();
                !fname.starts_with('.') && !ignore.contains(&fname.as_str())
            })
            .collect();
        items.sort_by_key(|e| (!e.file_type().map(|t| t.is_dir()).unwrap_or(false), e.file_name()));

        for entry in items {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let rel_path = pathdiff::diff_paths(&path, base)
                .unwrap_or_else(|| path.clone())
                .to_string_lossy()
                .to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

            let children = if is_dir {
                build_tree(&path, base)
            } else {
                vec![]
            };

            entries.push(FileEntry { name, path: rel_path, is_dir, children });
        }
    }
    entries
}

/// List directory contents (flat, non-recursive)
#[tauri::command]
fn list_project_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    let ignore = ["node_modules", ".git", "target", "dist", ".next", "__pycache__", ".vscode", "build"];

    if let Ok(read_dir) = std::fs::read_dir(dir) {
        let mut items: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
        items.sort_by_key(|e| {
            let fname = e.file_name().to_string_lossy().to_string();
            (!e.file_type().map(|t| t.is_dir()).unwrap_or(false), fname)
        });

        for entry in items {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || ignore.contains(&name.as_str()) {
                continue;
            }
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
                children: vec![],
            });
        }
    }
    Ok(entries)
}

/// Get a formatted tree string of the project (for injecting into AI prompts)
#[tauri::command]
fn get_project_tree(path: String, max_depth: u32) -> Result<String, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let tree = build_tree(dir, dir);
    let mut output = String::new();
    format_tree(&tree, 0, max_depth, &mut output);
    Ok(output)
}

fn format_tree(entries: &[FileEntry], depth: u32, max_depth: u32, mut output: &mut String) {
    if depth >= max_depth {
        if !entries.is_empty() {
            output.push_str(&"  ".repeat(depth as usize));
            output.push_str("...\n");
        }
        return;
    }
    for entry in entries {
        output.push_str(&"  ".repeat(depth as usize));
        if entry.is_dir {
            output.push_str(&format!("📁 {}/\n", entry.name));
            format_tree(&entry.children, depth + 1, max_depth, &mut output);
        } else {
            output.push_str(&format!("📄 {}\n", entry.name));
        }
    }
}

#[derive(Serialize)]
pub struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

/// DuckDuckGo wraps result links in a redirect; extract the real target URL
fn clean_url(href: &str) -> String {
    let full = if href.starts_with("//") {
        format!("https:{}", href)
    } else {
        href.to_string()
    };
    if let Ok(u) = url::Url::parse(&full) {
        if let Some((_, v)) = u.query_pairs().find(|(k, _)| k == "uddg") {
            return v.into_owned();
        }
    }
    full
}

/// Search the web via DuckDuckGo's HTML endpoint (no API key, no Docker, no CORS)
#[tauri::command]
async fn search_web(query: String) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let html = client
        .post("https://html.duckduckgo.com/html/")
        .form(&[("q", query.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let doc = scraper::Html::parse_document(&html);
    let row = scraper::Selector::parse("div.result:not(.result--ad)").unwrap();
    let a = scraper::Selector::parse("a.result__a").unwrap();
    let sn = scraper::Selector::parse(".result__snippet").unwrap();

    let mut out = Vec::new();
    for r in doc.select(&row).take(8) {
        if let Some(link) = r.select(&a).next() {
            out.push(SearchResult {
                title: link.text().collect::<String>().trim().to_string(),
                url: clean_url(link.value().attr("href").unwrap_or("")),
                snippet: r
                    .select(&sn)
                    .next()
                    .map(|s| s.text().collect::<String>().trim().to_string())
                    .unwrap_or_default(),
            });
        }
    }
    Ok(out)
}

/// Block localhost / private-network targets so a web page can't trick the AI into probing your LAN
fn is_blocked_host(u: &url::Url) -> bool {
    match u.host() {
        Some(url::Host::Domain(d)) => {
            let d = d.to_lowercase();
            d == "localhost" || d.ends_with(".localhost") || d.ends_with(".local") || d.ends_with(".internal")
        }
        Some(url::Host::Ipv4(ip)) => {
            ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified()
        }
        Some(url::Host::Ipv6(ip)) => {
            let segments = ip.segments();
            let unique_local = segments[0] & 0xfe00 == 0xfc00; // fc00::/7
            let link_local = segments[0] & 0xffc0 == 0xfe80; // fe80::/10
            let mapped_private = ip.to_ipv4_mapped().is_some_and(|v4| {
                v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified()
            });
            ip.is_loopback() || ip.is_unspecified() || unique_local || link_local || mapped_private
        }
        None => true,
    }
}

/// Fetch a web page and return its readable text (no CORS limits, scripts/styles stripped)
#[tauri::command]
async fn fetch_url(url: String, max_chars: Option<usize>) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("URL must start with http:// or https://".to_string());
    }
    if is_blocked_host(&parsed) {
        return Err("Blocked: local and private network addresses are not allowed".to_string());
    }
    let max = max_chars.unwrap_or(6000).min(100_000);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let mut resp = client.get(parsed).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let is_html = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("html"))
        .unwrap_or(true);
    const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
    if resp.content_length().is_some_and(|n| n > MAX_RESPONSE_BYTES as u64) {
        return Err("Page is larger than the 2 MiB reading limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err("Page is larger than the 2 MiB reading limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let raw = String::from_utf8_lossy(&bytes);

    let text = if is_html {
        let doc = scraper::Html::parse_document(&raw);
        let body_sel = scraper::Selector::parse("body").unwrap();
        let mut out = String::new();
        if let Some(body) = doc.select(&body_sel).next() {
            for node in body.descendants() {
                if let scraper::Node::Text(t) = node.value() {
                    let skip = node
                        .parent()
                        .and_then(|p| p.value().as_element())
                        .map(|e| matches!(e.name(), "script" | "style" | "noscript" | "svg"))
                        .unwrap_or(false);
                    if !skip {
                        let s = t.trim();
                        if !s.is_empty() {
                            out.push_str(s);
                            out.push(' ');
                        }
                    }
                }
            }
        }
        out
    } else {
        raw.to_string()
    };

    let text: String = text.chars().take(max).collect();
    Ok(if text.trim().is_empty() { "(empty page)".to_string() } else { text })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            read_project_file,
            write_project_file,
            delete_project_file,
            list_project_dir,
            get_project_tree,
            search_web,
            fetch_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
