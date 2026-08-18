use crate::sources::validate_source_url;
use crate::truncate_chars;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedInterviewQuestion {
    pub title: String,
    pub answer: String,
    pub code: String,
    pub code_language: String,
    pub difficulty: u8,
    pub tags: Vec<String>,
    pub sources: Vec<GeneratedReferenceSource>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GeneratedReferenceSource {
    pub title: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedInterviewExperience {
    pub title: String,
    pub summary: String,
    pub questions: Vec<GeneratedInterviewQuestion>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GeneratedInterviewQuestionOutline {
    pub title: String,
    pub difficulty: u8,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GeneratedInterviewOutline {
    pub title: String,
    pub summary: String,
    pub questions: Vec<GeneratedInterviewQuestionOutline>,
}

fn find_json_object(value: &str) -> Option<&str> {
    let bytes = value.as_bytes();
    let start = bytes.iter().position(|byte| *byte == b'{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, byte) in bytes[start..].iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                in_string = false;
            }
            continue;
        }

        match *byte {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return value.get(start..=start + offset);
                }
            }
            _ => {}
        }
    }
    None
}

pub fn parse_json_object_response(content: &str) -> Result<serde_json::Value, String> {
    let content = content
        .rsplit_once("</think>")
        .map(|(_, answer)| answer)
        .unwrap_or(content)
        .trim();

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(content) {
        return if value.is_object() {
            Ok(value)
        } else {
            Err("模型 JSON 顶层必须是对象".to_string())
        };
    }

    let mut first_valid_object = None;
    let mut last_parse_error = None;
    let mut saw_object_start = false;
    for (start, _) in content.match_indices('{') {
        saw_object_start = true;
        let Some(candidate) = find_json_object(&content[start..]) else {
            continue;
        };
        match serde_json::from_str::<serde_json::Value>(candidate) {
            Ok(value) if value.is_object() => {
                if value.get("title").is_some() && value.get("questions").is_some() {
                    return Ok(value);
                }
                if first_valid_object.is_none() {
                    first_valid_object = Some(value);
                }
            }
            Ok(_) => {}
            Err(error) => last_parse_error = Some(error),
        }
    }

    if let Some(value) = first_valid_object {
        return Ok(value);
    }
    if let Some(error) = last_parse_error {
        return Err(format!("模型 JSON 格式不正确：{error}"));
    }
    if saw_object_start {
        return Err("模型返回的 JSON 对象不完整".to_string());
    }
    Err("模型没有返回 JSON 对象".to_string())
}

fn required_string(
    value: &serde_json::Value,
    field: &str,
    max_chars: usize,
) -> Result<String, String> {
    let text = value
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| format!("模型结果缺少 {field}"))?;
    Ok(truncate_chars(text, max_chars))
}

fn optional_string(value: &serde_json::Value, fields: &[&str], max_chars: usize) -> String {
    fields
        .iter()
        .find_map(|field| value.get(*field).and_then(serde_json::Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| truncate_chars(text, max_chars))
        .unwrap_or_default()
}

fn parse_difficulty(value: Option<&serde_json::Value>) -> u8 {
    let numeric = value
        .and_then(serde_json::Value::as_u64)
        .and_then(|number| u8::try_from(number).ok());
    match numeric {
        Some(1..=3) => numeric.unwrap_or(2),
        _ => match value.and_then(serde_json::Value::as_str).map(str::trim) {
            Some("1" | "简单" | "easy") => 1,
            Some("3" | "困难" | "hard") => 3,
            _ => 2,
        },
    }
}

fn parse_tags(value: Option<&serde_json::Value>) -> Vec<String> {
    let candidates = match value {
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .filter_map(serde_json::Value::as_str)
            .map(str::to_string)
            .collect::<Vec<_>>(),
        Some(serde_json::Value::String(text)) => text
            .split([',', '，'])
            .map(str::to_string)
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    let mut tags = Vec::new();
    for candidate in candidates {
        let tag = truncate_chars(candidate.trim(), 30);
        if !tag.is_empty() && !tags.contains(&tag) {
            tags.push(tag);
        }
        if tags.len() == 12 {
            break;
        }
    }
    tags
}

pub fn parse_generated_outline(content: &str) -> Result<GeneratedInterviewOutline, String> {
    let root = parse_json_object_response(content)?;
    let title = required_string(&root, "title", 120)?;
    let summary = optional_string(&root, &["summary"], 1000);
    let raw_questions = root
        .get("questions")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 questions 数组".to_string())?;
    if raw_questions.is_empty() {
        return Err("没有从面经中识别出题目".to_string());
    }
    if raw_questions.len() > 60 {
        return Err("模型返回的题目超过 60 道，请缩短面经后重试".to_string());
    }

    let mut questions = Vec::with_capacity(raw_questions.len());
    let mut seen_titles = HashSet::new();
    for (index, raw) in raw_questions.iter().enumerate() {
        let title = required_string(raw, "title", 300)
            .map_err(|error| format!("第 {} 道题无效：{error}", index + 1))?;
        let dedupe_key = title
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        if !seen_titles.insert(dedupe_key) {
            continue;
        }
        questions.push(GeneratedInterviewQuestionOutline {
            title,
            difficulty: parse_difficulty(raw.get("difficulty")),
            tags: parse_tags(raw.get("tags")),
        });
    }
    if questions.is_empty() {
        return Err("模型只返回了重复或无效题目".to_string());
    }

    Ok(GeneratedInterviewOutline {
        title,
        summary,
        questions,
    })
}

pub fn parse_generated_experience(content: &str) -> Result<GeneratedInterviewExperience, String> {
    let root = parse_json_object_response(content)?;

    let title = required_string(&root, "title", 120)?;
    let summary = optional_string(&root, &["summary"], 1000);
    let raw_questions = root
        .get("questions")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 questions 数组".to_string())?;
    if raw_questions.is_empty() {
        return Err("没有从面经中识别出题目".to_string());
    }
    if raw_questions.len() > 80 {
        return Err("模型返回的题目超过 80 道，请缩短面经后重试".to_string());
    }

    let mut questions = Vec::with_capacity(raw_questions.len());
    let mut seen_titles = HashSet::new();
    for (index, raw) in raw_questions.iter().enumerate() {
        let title = required_string(raw, "title", 300)
            .map_err(|error| format!("第 {} 道题无效：{error}", index + 1))?;
        let answer = required_string(raw, "answer", 20000)
            .map_err(|error| format!("第 {} 道题无效：{error}", index + 1))?;
        let dedupe_key = title
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        if !seen_titles.insert(dedupe_key) {
            continue;
        }
        for heading in ["【结论】", "【原理】", "【实践】", "【边界】"] {
            if !answer.contains(heading) {
                return Err(format!(
                    "第 {} 道题的答案缺少 {heading} 章节，请重新解析",
                    index + 1
                ));
            }
        }
        if answer.chars().count() < 80 {
            return Err(format!("第 {} 道题的答案过短，请重新解析", index + 1));
        }
        let raw_sources = raw
            .get("sources")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| format!("第 {} 道题缺少 sources 数组", index + 1))?;
        if !(1..=4).contains(&raw_sources.len()) {
            return Err(format!("第 {} 道题必须提供 1 到 4 条参考文档", index + 1));
        }
        let mut sources = Vec::with_capacity(raw_sources.len());
        let mut seen_source_urls = HashSet::new();
        for raw_source in raw_sources {
            let source_title = required_string(raw_source, "title", 180)
                .map_err(|error| format!("第 {} 道题的参考文档无效：{error}", index + 1))?;
            let source_url = raw_source
                .get("url")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| format!("第 {} 道题的参考文档缺少 url", index + 1))?;
            if source_url.chars().count() > 2048 {
                return Err(format!("第 {} 道题的参考文档地址过长", index + 1));
            }
            let normalized_url = validate_source_url(source_url)
                .map_err(|_| {
                    format!(
                        "第 {} 道题的参考文档不是受信任的官方 HTTPS 地址：{}",
                        index + 1,
                        source_title
                    )
                })?
                .to_string();
            if seen_source_urls.insert(normalized_url.clone()) {
                sources.push(GeneratedReferenceSource {
                    title: source_title,
                    url: normalized_url,
                });
            }
        }
        if sources.is_empty() {
            return Err(format!("第 {} 道题没有有效参考文档", index + 1));
        }
        questions.push(GeneratedInterviewQuestion {
            title,
            answer,
            code: optional_string(raw, &["code"], 30000),
            code_language: {
                let language = optional_string(raw, &["codeLanguage", "code_language"], 30);
                if language.is_empty() {
                    "text".to_string()
                } else {
                    language
                }
            },
            difficulty: parse_difficulty(raw.get("difficulty")),
            tags: parse_tags(raw.get("tags")),
            sources,
        });
    }
    if questions.is_empty() {
        return Err("模型只返回了重复或无效题目".to_string());
    }

    Ok(GeneratedInterviewExperience {
        title,
        summary,
        questions,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        find_json_object, parse_generated_experience, parse_generated_outline,
        parse_json_object_response,
    };

    #[test]
    fn finds_the_interview_object_after_reasoning_or_markdown_noise() {
        let content = r#"analysis metadata: {"phase":"done"}
        ```json
        {"title":"Go 一面","summary":"并发","questions":[]}
        ```"#;
        let value = parse_json_object_response(content).unwrap();
        assert_eq!(
            value.get("title").and_then(serde_json::Value::as_str),
            Some("Go 一面")
        );
    }

    #[test]
    fn distinguishes_missing_invalid_and_incomplete_json() {
        assert_eq!(
            parse_json_object_response("plain text").unwrap_err(),
            "模型没有返回 JSON 对象"
        );
        assert_eq!(
            parse_json_object_response("{\"title\": \"partial\"").unwrap_err(),
            "模型返回的 JSON 对象不完整"
        );
        assert!(parse_json_object_response("{title: invalid}")
            .unwrap_err()
            .contains("JSON 格式不正确"));
    }

    #[test]
    fn extracts_json_around_reasoning_and_markdown() {
        let content = "<think>{not json}</think>```json\n{\"title\":\"A\",\"questions\":[]}\n```";
        assert_eq!(
            find_json_object(content.rsplit_once("</think>").unwrap().1),
            Some("{\"title\":\"A\",\"questions\":[]}")
        );
    }

    #[test]
    fn parses_and_normalizes_generated_experience() {
        let content = r#"
        ```json
        {
          "title": "Go 后端一面",
          "summary": "围绕并发与缓存",
          "questions": [{
            "title": "GMP 如何调度？",
            "answer": "【结论】GMP 共同完成 goroutine 调度并复用系统线程。\n【原理】P 持有本地运行队列，M 获取 P 后执行 G，必要时会工作窃取。\n【实践】避免长期阻塞并结合运行时指标观察调度延迟。\n【边界】调度优化不能替代并发上限、超时和背压设计。",
            "difficulty": "困难",
            "tags": "Golang，并发",
            "sources": [{
              "title": "Go runtime HACKING",
              "url": "https://go.dev/src/runtime/HACKING.md"
            }]
          }]
        }
        ```"#;
        let generated = parse_generated_experience(content).unwrap();
        assert_eq!(generated.title, "Go 后端一面");
        assert_eq!(generated.questions.len(), 1);
        assert_eq!(generated.questions[0].difficulty, 3);
        assert_eq!(generated.questions[0].code_language, "text");
        assert_eq!(generated.questions[0].tags, vec!["Golang", "并发"]);
        assert_eq!(generated.questions[0].sources.len(), 1);
        assert_eq!(
            generated.questions[0].sources[0].url,
            "https://go.dev/src/runtime/HACKING.md"
        );
    }

    #[test]
    fn rejects_generated_experience_without_trusted_references() {
        let content = r#"{
          "title": "Go 一面",
          "summary": "并发",
          "questions": [{
            "title": "GMP 如何调度？",
            "answer": "【结论】GMP 共同完成调度并复用线程。【原理】P 管理运行队列，M 执行 G，并通过工作窃取平衡负载。【实践】应结合调度延迟、阻塞和并发上限排查问题。【边界】运行时调度不能代替业务背压与超时治理。",
            "code": "",
            "codeLanguage": "text",
            "difficulty": 2,
            "tags": ["Golang"],
            "sources": [{"title": "未知博客", "url": "https://example.com/gmp"}]
          }]
        }"#;
        assert!(parse_generated_experience(content)
            .unwrap_err()
            .contains("不是受信任的官方 HTTPS 地址"));
    }

    #[test]
    fn parses_and_deduplicates_interview_outline() {
        let content = r#"{
          "title": "Go 一面",
          "summary": "并发与缓存",
          "questions": [
            {"title":"GMP 如何调度？","difficulty":3,"tags":["Go","并发"]},
            {"title":"GMP如何调度？","difficulty":2,"tags":["重复"]},
            {"title":"缓存一致性怎么做？","difficulty":2,"tags":["Redis"]}
          ]
        }"#;
        let outline = parse_generated_outline(content).unwrap();
        assert_eq!(outline.questions.len(), 2);
        assert_eq!(outline.questions[0].difficulty, 3);
        assert_eq!(outline.questions[1].title, "缓存一致性怎么做？");
    }
}
