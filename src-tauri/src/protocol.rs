use crate::compact_error_message;
use serde::Deserialize;
use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr},
    time::Duration,
};

pub const MAX_MODEL_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
pub const DEFAULT_MODEL_CONTEXT_LENGTH: u64 = 131_072;
pub const DEFAULT_MODEL_OUTPUT_LENGTH: u64 = 12_000;
const MODEL_INPUT_OVERHEAD_TOKENS: u64 = 256;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelProtocol {
    #[default]
    Openai,
    Responses,
    Anthropic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModelOutputFormat {
    Text,
    InterviewOutlineJson,
    InterviewExperienceJson,
    ResumeJson,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSettings {
    #[serde(default)]
    pub protocol: ModelProtocol,
    #[serde(alias = "endpoint")]
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default = "default_model_context_length")]
    pub context_length: u64,
    #[serde(default = "default_model_output_length")]
    pub output_length: u64,
}

const fn default_model_context_length() -> u64 {
    DEFAULT_MODEL_CONTEXT_LENGTH
}

const fn default_model_output_length() -> u64 {
    DEFAULT_MODEL_OUTPUT_LENGTH
}

fn is_private_ipv4(address: Ipv4Addr) -> bool {
    address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_unspecified()
        || address.is_broadcast()
}

fn is_private_ipv6(address: Ipv6Addr) -> bool {
    address.is_loopback()
        || address.is_unspecified()
        || address.is_unique_local()
        || address.is_unicast_link_local()
}

pub fn validate_model_settings(settings: &ModelSettings) -> Result<tauri::Url, String> {
    let base_url = tauri::Url::parse(settings.base_url.trim())
        .map_err(|_| "模型 Base URL 格式不正确".to_string())?;
    let host = base_url
        .host_str()
        .ok_or_else(|| "模型 Base URL 缺少主机名".to_string())?
        .to_ascii_lowercase();

    if base_url.scheme() != "https"
        || base_url.port().is_some()
        || !base_url.username().is_empty()
        || base_url.password().is_some()
        || base_url.fragment().is_some()
    {
        return Err("模型 Base URL 必须是安全的 HTTPS 地址".to_string());
    }

    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err("模型接口不能指向本机或局域网地址".to_string());
    }
    let ip_literal = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(&host);
    if let Ok(address) = ip_literal.parse::<IpAddr>() {
        let private = match address {
            IpAddr::V4(value) => is_private_ipv4(value),
            IpAddr::V6(value) => is_private_ipv6(value),
        };
        if private {
            return Err("模型接口不能指向本机或局域网地址".to_string());
        }
    }

    let api_key = settings.api_key.trim();
    if api_key.is_empty() || api_key.chars().count() > 4096 || api_key.chars().any(char::is_control)
    {
        return Err("API Key 为空或长度异常".to_string());
    }
    let model = settings.model.trim();
    if model.is_empty() || model.chars().count() > 200 {
        return Err("模型名称为空或长度异常".to_string());
    }
    if settings.context_length == 0 {
        return Err("上下文长度必须是正整数".to_string());
    }
    if settings.output_length == 0 {
        return Err("输出长度必须是正整数".to_string());
    }
    if settings.output_length >= settings.context_length {
        return Err("上下文长度必须大于输出长度".to_string());
    }

    Ok(base_url)
}

pub fn model_request_endpoint(settings: &ModelSettings) -> Result<tauri::Url, String> {
    let mut endpoint = validate_model_settings(settings)?;
    let suffix = match settings.protocol {
        ModelProtocol::Openai => &["chat", "completions"][..],
        ModelProtocol::Responses => &["responses"][..],
        ModelProtocol::Anthropic => &["v1", "messages"][..],
    };
    let suffix_path = format!("/{}", suffix.join("/"));
    if endpoint.path().ends_with(&suffix_path) {
        return Ok(endpoint);
    }
    let mut segments = endpoint
        .path_segments_mut()
        .map_err(|_| "模型 Base URL 无法拼接协议路径".to_string())?;
    segments.pop_if_empty();
    for segment in suffix {
        segments.push(segment);
    }
    drop(segments);
    Ok(endpoint)
}

fn interview_experience_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "title": { "type": "string" },
            "summary": { "type": "string" },
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "answer": { "type": "string" },
                        "code": { "type": "string" },
                        "codeLanguage": { "type": "string" },
                        "difficulty": { "type": "integer", "enum": [1, 2, 3] },
                        "tags": {
                            "type": "array",
                            "items": { "type": "string" }
                        },
                        "sources": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 4,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": { "type": "string" },
                                    "url": { "type": "string" }
                                },
                                "required": ["title", "url"],
                                "additionalProperties": false
                            }
                        }
                    },
                    "required": [
                        "title",
                        "answer",
                        "code",
                        "codeLanguage",
                        "difficulty",
                        "tags",
                        "sources"
                    ],
                    "additionalProperties": false
                }
            }
        },
        "required": ["title", "summary", "questions"],
        "additionalProperties": false
    })
}

fn interview_outline_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "title": { "type": "string" },
            "summary": { "type": "string" },
            "questions": {
                "type": "array",
                "minItems": 1,
                "maxItems": 60,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "difficulty": { "type": "integer", "enum": [1, 2, 3] },
                        "tags": {
                            "type": "array",
                            "items": { "type": "string" }
                        }
                    },
                    "required": ["title", "difficulty", "tags"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["title", "summary", "questions"],
        "additionalProperties": false
    })
}

fn resume_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "personal": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "headline": { "type": "string" },
                    "phone": { "type": "string" },
                    "email": { "type": "string" },
                    "location": { "type": "string" },
                    "website": { "type": "string" }
                },
                "required": ["name", "headline", "phone", "email", "location", "website"],
                "additionalProperties": false
            },
            "summary": { "type": "string" },
            "skills": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "category": { "type": "string" },
                        "items": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 16,
                            "items": { "type": "string" }
                        }
                    },
                    "required": ["category", "items"],
                    "additionalProperties": false
                }
            },
            "experience": {
                "type": "array",
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "properties": {
                        "company": { "type": "string" },
                        "role": { "type": "string" },
                        "startDate": { "type": "string" },
                        "endDate": { "type": "string" },
                        "highlights": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 8,
                            "items": { "type": "string" }
                        }
                    },
                    "required": ["company", "role", "startDate", "endDate", "highlights"],
                    "additionalProperties": false
                }
            },
            "projects": {
                "type": "array",
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "role": { "type": "string" },
                        "startDate": { "type": "string" },
                        "endDate": { "type": "string" },
                        "summary": { "type": "string" },
                        "highlights": {
                            "type": "array",
                            "maxItems": 8,
                            "items": { "type": "string" }
                        },
                        "technologies": {
                            "type": "array",
                            "maxItems": 16,
                            "items": { "type": "string" }
                        }
                    },
                    "required": [
                        "name", "role", "startDate", "endDate", "summary", "highlights", "technologies"
                    ],
                    "additionalProperties": false
                }
            },
            "education": {
                "type": "array",
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "properties": {
                        "school": { "type": "string" },
                        "degree": { "type": "string" },
                        "major": { "type": "string" },
                        "startDate": { "type": "string" },
                        "endDate": { "type": "string" },
                        "highlights": {
                            "type": "array",
                            "maxItems": 6,
                            "items": { "type": "string" }
                        }
                    },
                    "required": [
                        "school", "degree", "major", "startDate", "endDate", "highlights"
                    ],
                    "additionalProperties": false
                }
            }
        },
        "required": ["personal", "summary", "skills", "experience", "projects", "education"],
        "additionalProperties": false
    })
}

fn output_schema(output_format: ModelOutputFormat) -> Option<serde_json::Value> {
    match output_format {
        ModelOutputFormat::Text => None,
        ModelOutputFormat::InterviewOutlineJson => Some(interview_outline_schema()),
        ModelOutputFormat::InterviewExperienceJson => Some(interview_experience_schema()),
        ModelOutputFormat::ResumeJson => Some(resume_schema()),
    }
}

fn output_schema_name(output_format: ModelOutputFormat) -> &'static str {
    match output_format {
        ModelOutputFormat::ResumeJson => "resume",
        ModelOutputFormat::Text
        | ModelOutputFormat::InterviewOutlineJson
        | ModelOutputFormat::InterviewExperienceJson => "interview_experience",
    }
}

fn estimate_text_tokens(value: &str) -> u64 {
    let (ascii_bytes, non_ascii_bytes) = value.chars().fold((0u64, 0u64), |counts, character| {
        if character.is_ascii() {
            (counts.0 + 1, counts.1)
        } else {
            (counts.0, counts.1 + character.len_utf8() as u64)
        }
    });
    ascii_bytes.div_ceil(4) + non_ascii_bytes.div_ceil(2)
}

fn estimate_model_input_tokens(
    system_prompt: &str,
    user_prompt: &str,
    output_format: ModelOutputFormat,
) -> u64 {
    let schema_tokens = output_schema(output_format)
        .map(|schema| estimate_text_tokens(&schema.to_string()))
        .unwrap_or(0);
    estimate_text_tokens(system_prompt)
        .saturating_add(estimate_text_tokens(user_prompt))
        .saturating_add(schema_tokens)
        .saturating_add(MODEL_INPUT_OVERHEAD_TOKENS)
}

pub fn validate_context_budget(
    settings: &ModelSettings,
    system_prompt: &str,
    user_prompt: &str,
    output_format: ModelOutputFormat,
) -> Result<(), String> {
    let estimated_input = estimate_model_input_tokens(system_prompt, user_prompt, output_format);
    let available_input = settings
        .context_length
        .saturating_sub(settings.output_length);
    if estimated_input > available_input {
        return Err(format!(
            "当前请求预计需要 {estimated_input} 个输入 token，但上下文长度 {} 在为输出预留 {} token 后只剩 {available_input}；请提高上下文长度、降低输出长度或缩短输入内容",
            settings.context_length, settings.output_length
        ));
    }
    Ok(())
}

fn model_request_body(
    settings: &ModelSettings,
    system_prompt: &str,
    user_prompt: &str,
    output_format: ModelOutputFormat,
) -> serde_json::Value {
    let mut body = match settings.protocol {
        ModelProtocol::Openai => serde_json::json!({
            "model": settings.model.trim(),
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ],
            "temperature": 0.2,
            "max_tokens": settings.output_length,
            "stream": false
        }),
        ModelProtocol::Responses => serde_json::json!({
            "model": settings.model.trim(),
            "instructions": system_prompt,
            "input": user_prompt,
            "max_output_tokens": settings.output_length,
            "stream": false
        }),
        ModelProtocol::Anthropic => serde_json::json!({
            "model": settings.model.trim(),
            "system": system_prompt,
            "messages": [{ "role": "user", "content": user_prompt }],
            "temperature": 0.2,
            "max_tokens": settings.output_length,
            "stream": false
        }),
    };

    if let Some(schema) = output_schema(output_format) {
        let schema_name = output_schema_name(output_format);
        match settings.protocol {
            ModelProtocol::Openai => {
                body["response_format"] = serde_json::json!({
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema_name,
                        "strict": true,
                        "schema": schema
                    }
                });
            }
            ModelProtocol::Responses => {
                body["text"] = serde_json::json!({
                    "format": {
                        "type": "json_schema",
                        "name": schema_name,
                        "strict": true,
                        "schema": schema
                    }
                });
            }
            ModelProtocol::Anthropic => {
                body["output_config"] = serde_json::json!({
                    "format": {
                        "type": "json_schema",
                        "schema": schema
                    }
                });
            }
        }
    }

    body
}

fn reqwest_error_detail(error: &reqwest::Error) -> String {
    let mut details = Vec::new();
    let mut source = std::error::Error::source(error);
    while let Some(current) = source {
        let message = current.to_string();
        if !message.is_empty() && details.last() != Some(&message) {
            details.push(message);
        }
        source = current.source();
    }
    if details.is_empty() {
        details.push(error.to_string());
    }
    compact_error_message(&details.join("："))
}

async fn read_model_response(
    mut response: reqwest::Response,
) -> Result<(reqwest::StatusCode, Vec<u8>), String> {
    let status = response.status();
    let mut bytes = Vec::new();

    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if bytes.len().saturating_add(chunk.len()) > MAX_MODEL_RESPONSE_BYTES {
                    return Err("模型响应过大，请缩短面经后重试".to_string());
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => {
                if error.is_timeout() {
                    return Err(
                        "读取模型响应失败：连续 10 分钟未收到服务端数据，连接已终止".to_string()
                    );
                }
                return Err(format!(
                    "读取模型响应失败：服务端未完整返回响应（{}）",
                    reqwest_error_detail(&error)
                ));
            }
        }
    }

    Ok((status, bytes))
}

fn extract_chat_completions_content(value: &serde_json::Value) -> Option<String> {
    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?;

    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }

    let parts = content.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| {
            part.get("text")
                .and_then(serde_json::Value::as_str)
                .or_else(|| part.get("content").and_then(serde_json::Value::as_str))
        })
        .collect::<Vec<_>>()
        .join("");
    (!text.is_empty()).then_some(text)
}

fn join_text_parts<'a>(parts: impl Iterator<Item = &'a serde_json::Value>) -> Option<String> {
    let text = parts
        .filter_map(|part| part.get("text").and_then(serde_json::Value::as_str))
        .collect::<Vec<_>>()
        .join("");
    (!text.is_empty()).then_some(text)
}

fn extract_responses_content(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(serde_json::Value::as_str) {
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }

    let parts = value
        .get("output")?
        .as_array()?
        .iter()
        .filter_map(|item| item.get("content").and_then(serde_json::Value::as_array))
        .flatten()
        .filter(|part| {
            part.get("type").and_then(serde_json::Value::as_str) == Some("output_text")
                || part.get("type").is_none()
        });
    join_text_parts(parts)
}

fn extract_anthropic_content(value: &serde_json::Value) -> Option<String> {
    let parts = value.get("content")?.as_array()?.iter().filter(|part| {
        part.get("type").and_then(serde_json::Value::as_str) == Some("text")
            || part.get("type").is_none()
    });
    join_text_parts(parts)
}

fn extract_model_content(protocol: ModelProtocol, value: &serde_json::Value) -> Option<String> {
    match protocol {
        ModelProtocol::Openai => extract_chat_completions_content(value),
        ModelProtocol::Responses => extract_responses_content(value),
        ModelProtocol::Anthropic => extract_anthropic_content(value),
    }
}

fn responses_output_types(value: &serde_json::Value) -> Vec<String> {
    let mut types = value
        .get("output")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|item| {
            let item_type = item
                .get("type")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            let content_types = item
                .get("content")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|part| {
                    part.get("type")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string)
                });
            item_type.into_iter().chain(content_types)
        })
        .collect::<Vec<_>>();
    types.sort();
    types.dedup();
    types
}

fn responses_refusal(value: &serde_json::Value) -> Option<&str> {
    value
        .get("output")?
        .as_array()?
        .iter()
        .filter_map(|item| item.get("content").and_then(serde_json::Value::as_array))
        .flatten()
        .find_map(|part| {
            (part.get("type").and_then(serde_json::Value::as_str) == Some("refusal"))
                .then(|| part.get("refusal").and_then(serde_json::Value::as_str))
                .flatten()
        })
}

fn responses_status_error(value: &serde_json::Value, max_output_tokens: u64) -> Option<String> {
    let status = value.get("status").and_then(serde_json::Value::as_str);
    let incomplete_reason = value
        .pointer("/incomplete_details/reason")
        .and_then(serde_json::Value::as_str);
    if status == Some("incomplete") {
        return Some(match incomplete_reason {
            Some("max_output_tokens") => format!(
                "模型响应在 {max_output_tokens} token 的输出预算处被截断（Responses status=incomplete，reason=max_output_tokens）"
            ),
            Some(reason) => format!(
                "模型未完成本次请求（Responses status=incomplete，reason={}）",
                compact_error_message(reason)
            ),
            None => "模型未完成本次请求（Responses status=incomplete，服务端未提供原因）"
                .to_string(),
        });
    }

    if status == Some("failed") {
        let detail = value
            .pointer("/error/message")
            .and_then(serde_json::Value::as_str)
            .or_else(|| {
                value
                    .pointer("/error/code")
                    .and_then(serde_json::Value::as_str)
            })
            .map(compact_error_message)
            .unwrap_or_else(|| "服务端未提供错误说明".to_string());
        return Some(format!("模型生成失败（Responses status=failed）：{detail}"));
    }

    if matches!(status, Some("queued" | "in_progress" | "cancelled")) {
        return Some(format!(
            "模型没有返回已完成的同步响应（Responses status={}）",
            status.unwrap_or_default()
        ));
    }

    None
}

fn responses_missing_content_error(value: &serde_json::Value, max_output_tokens: u64) -> String {
    if let Some(refusal) = responses_refusal(value) {
        return format!("模型拒绝了本次请求：{}", compact_error_message(refusal));
    }
    if let Some(error) = responses_status_error(value, max_output_tokens) {
        return error;
    }

    let status = value.get("status").and_then(serde_json::Value::as_str);
    let output_types = responses_output_types(value);
    let type_detail = if output_types.is_empty() {
        "output 为空".to_string()
    } else {
        format!("output 类型：{}", output_types.join("、"))
    };
    let status_detail = status
        .map(|value| format!("status={value}，"))
        .unwrap_or_default();
    format!("Responses 响应未包含标准 output_text（{status_detail}{type_detail}）")
}

fn model_completion_error(
    protocol: ModelProtocol,
    value: &serde_json::Value,
    max_output_tokens: u64,
) -> Option<String> {
    match protocol {
        ModelProtocol::Openai => {
            let choice = value
                .get("choices")
                .and_then(serde_json::Value::as_array)
                .and_then(|choices| choices.first());
            if let Some(refusal) = choice
                .and_then(|choice| choice.pointer("/message/refusal"))
                .and_then(serde_json::Value::as_str)
            {
                return Some(format!(
                    "模型拒绝了本次请求：{}",
                    compact_error_message(refusal)
                ));
            }
            match choice
                .and_then(|choice| choice.get("finish_reason"))
                .and_then(serde_json::Value::as_str)
            {
                Some("length") => Some(format!(
                    "模型响应在 {max_output_tokens} token 的输出预算处被截断（Chat Completions finish_reason=length）"
                )),
                Some("content_filter") => {
                    Some("模型响应被内容过滤器截断（Chat Completions）".to_string())
                }
                _ => None,
            }
        }
        ModelProtocol::Responses => responses_status_error(value, max_output_tokens),
        ModelProtocol::Anthropic => {
            match value
                .get("stop_reason")
                .and_then(serde_json::Value::as_str)
            {
                Some("max_tokens") => Some(format!(
                    "模型响应在 {max_output_tokens} token 的输出预算处被截断（Anthropic stop_reason=max_tokens）"
                )),
                Some("refusal") => Some("模型拒绝了本次请求（Anthropic stop_reason=refusal）".to_string()),
                Some("pause_turn") => {
                    Some("模型暂停了本次响应，未返回最终结果（Anthropic stop_reason=pause_turn）".to_string())
                }
                Some("model_context_window_exceeded") => Some(
                    "面经与提示词超过模型上下文窗口（Anthropic stop_reason=model_context_window_exceeded）"
                        .to_string(),
                ),
                _ => None,
            }
        }
    }
}

fn missing_model_content_error(
    protocol: ModelProtocol,
    value: &serde_json::Value,
    max_output_tokens: u64,
) -> String {
    let mismatch = match protocol {
        ModelProtocol::Openai if extract_responses_content(value).is_some() => {
            Some("接口返回了 Responses 格式，请将协议切换为 OpenAI Responses")
        }
        ModelProtocol::Openai if extract_anthropic_content(value).is_some() => {
            Some("接口返回了 Anthropic 格式，请将协议切换为 Anthropic Messages")
        }
        ModelProtocol::Responses if extract_chat_completions_content(value).is_some() => {
            Some("接口返回了 Chat Completions 格式，请将协议切换为 OpenAI Chat Completions")
        }
        ModelProtocol::Responses if extract_anthropic_content(value).is_some() => {
            Some("接口返回了 Anthropic 格式，请将协议切换为 Anthropic Messages")
        }
        ModelProtocol::Anthropic if extract_chat_completions_content(value).is_some() => {
            Some("接口返回了 Chat Completions 格式，请将协议切换为 OpenAI Chat Completions")
        }
        ModelProtocol::Anthropic if extract_responses_content(value).is_some() => {
            Some("接口返回了 Responses 格式，请将协议切换为 OpenAI Responses")
        }
        _ => None,
    };
    if let Some(message) = mismatch {
        return message.to_string();
    }

    if protocol == ModelProtocol::Responses
        && value.get("object").and_then(serde_json::Value::as_str) == Some("response")
    {
        return responses_missing_content_error(value, max_output_tokens);
    }

    let object_type = value
        .get("object")
        .and_then(serde_json::Value::as_str)
        .map(|value| format!("，响应类型为 {value}"))
        .unwrap_or_default();
    format!("模型没有返回所选协议的文本内容{object_type}")
}

pub async fn call_model(
    settings: &ModelSettings,
    system_prompt: &str,
    user_prompt: &str,
    output_format: ModelOutputFormat,
) -> Result<String, String> {
    let endpoint = model_request_endpoint(settings)?;
    validate_context_budget(settings, system_prompt, user_prompt, output_format)?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(10 * 60))
        .timeout(Duration::from_secs(12 * 60))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("mianshi/0.1")
        .build()
        .map_err(|error| format!("无法初始化模型连接：{error}"))?;

    let body = model_request_body(settings, system_prompt, user_prompt, output_format);

    let request = client
        .post(endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .json(&body);
    let request = match settings.protocol {
        ModelProtocol::Openai | ModelProtocol::Responses => {
            request.bearer_auth(settings.api_key.trim())
        }
        ModelProtocol::Anthropic => request
            .header("x-api-key", settings.api_key.trim())
            .header("anthropic-version", "2023-06-01"),
    };

    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "模型请求超时，请检查网络或稍后重试".to_string()
        } else {
            format!("无法连接模型接口：{error}")
        }
    })?;

    let (status, bytes) = read_model_response(response).await?;

    let payload: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| format!("模型接口返回了无法解析的数据（HTTP {status}）"))?;
    if !status.is_success() {
        let detail = payload
            .pointer("/error/message")
            .and_then(serde_json::Value::as_str)
            .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
            .map(compact_error_message)
            .unwrap_or_else(|| "未提供错误说明".to_string());
        return Err(format!("模型接口请求失败（HTTP {status}）：{detail}"));
    }

    if let Some(error) = model_completion_error(settings.protocol, &payload, settings.output_length)
    {
        return Err(error);
    }

    extract_model_content(settings.protocol, &payload)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| {
            missing_model_content_error(settings.protocol, &payload, settings.output_length)
        })
}

#[cfg(test)]
mod tests {
    use super::{
        extract_model_content, missing_model_content_error, model_completion_error,
        model_request_body, model_request_endpoint, validate_context_budget,
        validate_model_settings, ModelOutputFormat, ModelProtocol, ModelSettings,
        DEFAULT_MODEL_CONTEXT_LENGTH, DEFAULT_MODEL_OUTPUT_LENGTH,
    };
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn settings(base_url: &str) -> ModelSettings {
        ModelSettings {
            protocol: ModelProtocol::Openai,
            base_url: base_url.to_string(),
            api_key: "test-key".to_string(),
            model: "test-model".to_string(),
            context_length: 131_072,
            output_length: 12_000,
        }
    }

    #[test]
    fn model_endpoint_accepts_public_https_and_rejects_local_networks() {
        assert!(validate_model_settings(&settings("https://api.example.com")).is_ok());

        for base_url in [
            "http://api.example.com/v1",
            "https://localhost/v1",
            "https://127.0.0.1/v1",
            "https://10.0.0.8/v1",
            "https://[::1]/v1",
            "https://api.example.com:8443/v1",
        ] {
            assert!(
                validate_model_settings(&settings(base_url)).is_err(),
                "accepted {base_url}"
            );
        }
    }

    #[test]
    fn builds_request_paths_from_protocol_neutral_base_urls() {
        let mut value = settings("https://gateway.example.com/v1");
        assert_eq!(
            model_request_endpoint(&value).unwrap().as_str(),
            "https://gateway.example.com/v1/chat/completions"
        );

        value.protocol = ModelProtocol::Responses;
        assert_eq!(
            model_request_endpoint(&value).unwrap().as_str(),
            "https://gateway.example.com/v1/responses"
        );

        value.protocol = ModelProtocol::Anthropic;
        value.base_url = "https://gateway.example.com/anthropic".to_string();
        assert_eq!(
            model_request_endpoint(&value).unwrap().as_str(),
            "https://gateway.example.com/anthropic/v1/messages"
        );
    }

    #[test]
    fn requests_protocol_native_structured_json_for_interview_analysis() {
        let fixtures = [
            (
                ModelProtocol::Openai,
                "/response_format/type",
                "/response_format/json_schema/schema",
                "/max_tokens",
            ),
            (
                ModelProtocol::Responses,
                "/text/format/type",
                "/text/format/schema",
                "/max_output_tokens",
            ),
            (
                ModelProtocol::Anthropic,
                "/output_config/format/type",
                "/output_config/format/schema",
                "/max_tokens",
            ),
        ];

        for (protocol, type_path, schema_path, output_length_path) in fixtures {
            let mut value = settings("https://api.example.com/v1");
            value.protocol = protocol;
            value.output_length = 7_777;
            let body = model_request_body(
                &value,
                "system",
                "user",
                ModelOutputFormat::InterviewExperienceJson,
            );
            assert_eq!(
                body.pointer(type_path).and_then(serde_json::Value::as_str),
                Some("json_schema")
            );
            assert_eq!(
                body.pointer(output_length_path)
                    .and_then(serde_json::Value::as_u64),
                Some(7_777)
            );
            let schema = body.pointer(schema_path).unwrap();
            assert_eq!(
                schema
                    .get("additionalProperties")
                    .and_then(serde_json::Value::as_bool),
                Some(false)
            );
            assert_eq!(
                schema
                    .pointer("/properties/questions/items/required")
                    .and_then(serde_json::Value::as_array)
                    .map(Vec::len),
                Some(7)
            );
        }
    }

    #[test]
    fn connection_test_does_not_request_structured_json() {
        let value = settings("https://api.example.com/v1");
        let body = model_request_body(&value, "system", "user", ModelOutputFormat::Text);
        assert!(body.get("response_format").is_none());
    }

    #[test]
    fn requests_strict_resume_schema_with_a_distinct_name() {
        let value = settings("https://api.example.com/v1");
        let body = model_request_body(&value, "system", "user", ModelOutputFormat::ResumeJson);

        assert_eq!(
            body.pointer("/response_format/json_schema/name")
                .and_then(serde_json::Value::as_str),
            Some("resume")
        );
        let schema = body.pointer("/response_format/json_schema/schema").unwrap();
        assert_eq!(
            schema
                .pointer("/properties/personal/additionalProperties")
                .and_then(serde_json::Value::as_bool),
            Some(false)
        );
        assert_eq!(
            schema
                .pointer("/properties/experience/items/properties/highlights/maxItems")
                .and_then(serde_json::Value::as_u64),
            Some(8)
        );
    }

    #[test]
    fn enforces_configured_context_budget_before_sending() {
        let mut value = settings("https://api.example.com/v1");
        value.context_length = 4_096;
        value.output_length = 1_024;
        assert!(validate_context_budget(
            &value,
            "system",
            "short input",
            ModelOutputFormat::InterviewExperienceJson,
        )
        .is_ok());

        let error = validate_context_budget(
            &value,
            "system",
            &"面".repeat(3_000),
            ModelOutputFormat::InterviewExperienceJson,
        )
        .unwrap_err();
        assert!(error.contains("上下文长度 4096"));
        assert!(error.contains("预留 1024"));
    }

    #[test]
    fn rejects_invalid_context_and_output_settings() {
        let mut value = settings("https://api.example.com/v1");
        value.context_length = 4_096;
        value.output_length = 4_096;
        assert!(validate_model_settings(&value)
            .unwrap_err()
            .contains("必须大于输出长度"));

        value.context_length = 131_072;
        value.output_length = 0;
        assert!(validate_model_settings(&value)
            .unwrap_err()
            .contains("输出长度必须是正整数"));
    }

    #[test]
    fn old_model_settings_default_to_chat_completions() {
        let parsed: ModelSettings = serde_json::from_value(serde_json::json!({
            "endpoint": "https://api.example.com/v1/chat/completions",
            "apiKey": "test-key",
            "model": "test-model"
        }))
        .unwrap();
        assert_eq!(parsed.protocol, ModelProtocol::Openai);
        assert_eq!(
            parsed.base_url,
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(parsed.context_length, DEFAULT_MODEL_CONTEXT_LENGTH);
        assert_eq!(parsed.output_length, DEFAULT_MODEL_OUTPUT_LENGTH);
    }

    #[test]
    fn extracts_text_from_all_supported_protocols() {
        let fixtures = [
            (
                ModelProtocol::Openai,
                serde_json::json!({"choices":[{"message":{"content":"chat result"}}]}),
                "chat result",
            ),
            (
                ModelProtocol::Responses,
                serde_json::json!({"output":[{"type":"message","content":[{"type":"output_text","text":"responses result"}]}]}),
                "responses result",
            ),
            (
                ModelProtocol::Anthropic,
                serde_json::json!({"content":[{"type":"text","text":"anthropic result"}]}),
                "anthropic result",
            ),
        ];

        for (protocol, payload, expected) in fixtures {
            assert_eq!(
                extract_model_content(protocol, &payload).as_deref(),
                Some(expected)
            );
        }
    }

    #[test]
    fn explains_when_response_shape_uses_a_different_protocol() {
        let chat_payload = serde_json::json!({"choices":[{"message":{"content":"chat result"}}]});
        assert!(
            missing_model_content_error(ModelProtocol::Responses, &chat_payload, 4096)
                .contains("Chat Completions")
        );
    }

    #[test]
    fn explains_responses_output_budget_exhaustion() {
        let payload = serde_json::json!({
            "object": "response",
            "status": "incomplete",
            "incomplete_details": { "reason": "max_output_tokens" },
            "output": [{ "type": "reasoning", "summary": [] }]
        });
        let error = missing_model_content_error(ModelProtocol::Responses, &payload, 4096);
        assert!(error.contains("4096 token"));
        assert!(error.contains("status=incomplete"));
        assert!(error.contains("reason=max_output_tokens"));
    }

    #[test]
    fn explains_responses_refusal_without_treating_it_as_text() {
        let payload = serde_json::json!({
            "object": "response",
            "status": "completed",
            "output": [{
                "type": "message",
                "content": [{ "type": "refusal", "refusal": "request refused" }]
            }]
        });
        assert_eq!(
            extract_model_content(ModelProtocol::Responses, &payload),
            None
        );
        assert!(
            missing_model_content_error(ModelProtocol::Responses, &payload, 4096)
                .contains("request refused")
        );
    }

    #[test]
    fn reports_non_text_responses_items_without_a_shape_fallback() {
        let payload = serde_json::json!({
            "object": "response",
            "status": "completed",
            "output": [{ "type": "reasoning", "summary": [] }]
        });
        let error = missing_model_content_error(ModelProtocol::Responses, &payload, 4096);
        assert!(error.contains("未包含标准 output_text"));
        assert!(error.contains("reasoning"));
    }

    #[test]
    fn rejects_truncated_structured_outputs_before_json_parsing() {
        let fixtures = [
            (
                ModelProtocol::Openai,
                serde_json::json!({
                    "choices": [{
                        "finish_reason": "length",
                        "message": { "content": "{\"title\":\"partial" }
                    }]
                }),
            ),
            (
                ModelProtocol::Responses,
                serde_json::json!({
                    "object": "response",
                    "status": "incomplete",
                    "incomplete_details": { "reason": "max_output_tokens" },
                    "output_text": "{\"title\":\"partial"
                }),
            ),
            (
                ModelProtocol::Anthropic,
                serde_json::json!({
                    "stop_reason": "max_tokens",
                    "content": [{ "type": "text", "text": "{\"title\":\"partial" }]
                }),
            ),
        ];

        for (protocol, payload) in fixtures {
            let error = model_completion_error(protocol, &payload, 12000).unwrap();
            assert!(error.contains("12000 token"));
            assert!(error.contains("截断"));
        }
    }

    #[test]
    fn rejects_incomplete_chunked_responses_without_a_compatibility_fallback() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            let _ = stream.read(&mut request);
            let body = r#"{"output_text":"complete result"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n{:X}\r\n{}\r\n",
                body.len(),
                body
            )
            .unwrap();
            // Deliberately omit the terminating zero-size chunk.
        });

        let error = tauri::async_runtime::block_on(async {
            let response = reqwest::Client::new()
                .get(format!("http://{address}"))
                .send()
                .await
                .unwrap();
            super::read_model_response(response).await.unwrap_err()
        });
        server.join().unwrap();
        assert!(error.contains("服务端未完整返回响应"));
    }
}
