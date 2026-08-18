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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedResumePersonal {
    pub name: String,
    pub headline: String,
    pub phone: String,
    pub email: String,
    pub location: String,
    pub website: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GeneratedResumeSkillGroup {
    pub category: String,
    pub items: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedResumeExperience {
    pub company: String,
    pub role: String,
    pub start_date: String,
    pub end_date: String,
    pub highlights: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedResumeProject {
    pub name: String,
    pub role: String,
    pub start_date: String,
    pub end_date: String,
    pub summary: String,
    pub highlights: Vec<String>,
    pub technologies: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedResumeEducation {
    pub school: String,
    pub degree: String,
    pub major: String,
    pub start_date: String,
    pub end_date: String,
    pub highlights: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct GeneratedResume {
    pub personal: GeneratedResumePersonal,
    pub summary: String,
    pub skills: Vec<GeneratedResumeSkillGroup>,
    pub experience: Vec<GeneratedResumeExperience>,
    pub projects: Vec<GeneratedResumeProject>,
    pub education: Vec<GeneratedResumeEducation>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedJobInterviewQuestion {
    pub question: String,
    pub category: String,
    pub difficulty: u8,
    pub why_asked: String,
    pub answer_guide: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedJobInterviewFocusArea {
    pub title: String,
    pub priority: u8,
    pub reason: String,
    pub key_points: Vec<String>,
    pub likely_questions: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedJobInterviewFocus {
    pub target_role: String,
    pub overview: String,
    pub keywords: Vec<String>,
    pub focus_areas: Vec<GeneratedJobInterviewFocusArea>,
    pub preparation_checklist: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedJobApplicationAnalysis {
    pub target_role: String,
    pub match_score: u8,
    pub summary: String,
    pub strengths: Vec<String>,
    pub gaps: Vec<String>,
    pub keywords: Vec<String>,
    pub resume_changes: Vec<String>,
    pub interview_questions: Vec<GeneratedJobInterviewQuestion>,
    pub optimized_resume: GeneratedResume,
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
                if (value.get("title").is_some() && value.get("questions").is_some())
                    || (value.get("personal").is_some()
                        && value.get("skills").is_some()
                        && value.get("experience").is_some())
                    || (value.get("targetRole").is_some()
                        && value.get("interviewQuestions").is_some()
                        && value.get("optimizedResume").is_some())
                    || (value.get("targetRole").is_some()
                        && value.get("focusAreas").is_some()
                        && value.get("preparationChecklist").is_some())
                {
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

fn string_array(
    value: Option<&serde_json::Value>,
    field: &str,
    max_items: usize,
    max_chars: usize,
) -> Result<Vec<String>, String> {
    let raw_items = value
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| format!("模型结果缺少 {field} 数组"))?;
    if raw_items.len() > max_items {
        return Err(format!("模型结果中的 {field} 数量超过 {max_items} 项"));
    }

    let mut items = Vec::new();
    for raw in raw_items {
        let item = raw
            .as_str()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| truncate_chars(item, max_chars));
        if let Some(item) = item {
            if !items.contains(&item) {
                items.push(item);
            }
        }
    }
    Ok(items)
}

pub fn parse_generated_resume(content: &str) -> Result<GeneratedResume, String> {
    let root = parse_json_object_response(content)?;
    parse_generated_resume_value(&root)
}

fn parse_generated_resume_value(root: &serde_json::Value) -> Result<GeneratedResume, String> {
    let raw_personal = root
        .get("personal")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "模型结果缺少 personal 对象".to_string())?;
    let personal_value = serde_json::Value::Object(raw_personal.clone());
    let personal = GeneratedResumePersonal {
        name: required_string(&personal_value, "name", 80)?,
        headline: required_string(&personal_value, "headline", 120)?,
        phone: optional_string(&personal_value, &["phone"], 80),
        email: optional_string(&personal_value, &["email"], 120),
        location: optional_string(&personal_value, &["location"], 100),
        website: optional_string(&personal_value, &["website"], 200),
    };
    let summary = required_string(&root, "summary", 1_000)?;

    let raw_skills = root
        .get("skills")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 skills 数组".to_string())?;
    if raw_skills.is_empty() || raw_skills.len() > 8 {
        return Err("模型结果中的技能分类需为 1 到 8 组".to_string());
    }
    let mut skills = Vec::with_capacity(raw_skills.len());
    for (index, raw) in raw_skills.iter().enumerate() {
        let category = required_string(raw, "category", 50)
            .map_err(|error| format!("第 {} 组技能无效：{error}", index + 1))?;
        let items = string_array(raw.get("items"), "items", 16, 50)
            .map_err(|error| format!("第 {} 组技能无效：{error}", index + 1))?;
        if items.is_empty() {
            return Err(format!("第 {} 组技能没有有效内容", index + 1));
        }
        skills.push(GeneratedResumeSkillGroup { category, items });
    }

    let raw_experience = root
        .get("experience")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 experience 数组".to_string())?;
    if raw_experience.len() > 10 {
        return Err("模型结果中的工作经历超过 10 段".to_string());
    }
    let mut experience = Vec::with_capacity(raw_experience.len());
    for (index, raw) in raw_experience.iter().enumerate() {
        let highlights = string_array(raw.get("highlights"), "highlights", 8, 300)
            .map_err(|error| format!("第 {} 段工作经历无效：{error}", index + 1))?;
        if highlights.is_empty() {
            return Err(format!("第 {} 段工作经历缺少成果描述", index + 1));
        }
        experience.push(GeneratedResumeExperience {
            company: required_string(raw, "company", 120)
                .map_err(|error| format!("第 {} 段工作经历无效：{error}", index + 1))?,
            role: required_string(raw, "role", 120)
                .map_err(|error| format!("第 {} 段工作经历无效：{error}", index + 1))?,
            start_date: optional_string(raw, &["startDate", "start_date"], 40),
            end_date: optional_string(raw, &["endDate", "end_date"], 40),
            highlights,
        });
    }

    let raw_projects = root
        .get("projects")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 projects 数组".to_string())?;
    if raw_projects.len() > 10 {
        return Err("模型结果中的项目经历超过 10 段".to_string());
    }
    let mut projects = Vec::with_capacity(raw_projects.len());
    for (index, raw) in raw_projects.iter().enumerate() {
        projects.push(GeneratedResumeProject {
            name: required_string(raw, "name", 120)
                .map_err(|error| format!("第 {} 个项目无效：{error}", index + 1))?,
            role: optional_string(raw, &["role"], 120),
            start_date: optional_string(raw, &["startDate", "start_date"], 40),
            end_date: optional_string(raw, &["endDate", "end_date"], 40),
            summary: required_string(raw, "summary", 500)
                .map_err(|error| format!("第 {} 个项目无效：{error}", index + 1))?,
            highlights: string_array(raw.get("highlights"), "highlights", 8, 300)
                .map_err(|error| format!("第 {} 个项目无效：{error}", index + 1))?,
            technologies: string_array(raw.get("technologies"), "technologies", 16, 50)
                .map_err(|error| format!("第 {} 个项目无效：{error}", index + 1))?,
        });
    }

    let raw_education = root
        .get("education")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 education 数组".to_string())?;
    if raw_education.len() > 6 {
        return Err("模型结果中的教育经历超过 6 段".to_string());
    }
    let mut education = Vec::with_capacity(raw_education.len());
    for (index, raw) in raw_education.iter().enumerate() {
        education.push(GeneratedResumeEducation {
            school: required_string(raw, "school", 120)
                .map_err(|error| format!("第 {} 段教育经历无效：{error}", index + 1))?,
            degree: required_string(raw, "degree", 80)
                .map_err(|error| format!("第 {} 段教育经历无效：{error}", index + 1))?,
            major: optional_string(raw, &["major"], 100),
            start_date: optional_string(raw, &["startDate", "start_date"], 40),
            end_date: optional_string(raw, &["endDate", "end_date"], 40),
            highlights: string_array(raw.get("highlights"), "highlights", 6, 300)
                .map_err(|error| format!("第 {} 段教育经历无效：{error}", index + 1))?,
        });
    }

    if experience.is_empty() && projects.is_empty() && education.is_empty() {
        return Err("模型没有生成工作、项目或教育经历".to_string());
    }

    Ok(GeneratedResume {
        personal,
        summary,
        skills,
        experience,
        projects,
        education,
    })
}

pub fn parse_job_application_analysis(
    content: &str,
) -> Result<GeneratedJobApplicationAnalysis, String> {
    let root = parse_json_object_response(content)?;
    let target_role = required_string(&root, "targetRole", 120)?;
    let match_score = root
        .get("matchScore")
        .and_then(serde_json::Value::as_u64)
        .filter(|score| *score <= 100)
        .and_then(|score| u8::try_from(score).ok())
        .ok_or_else(|| "模型结果中的 matchScore 必须是 0 到 100 的整数".to_string())?;
    let summary = required_string(&root, "summary", 1_000)?;

    let strengths = string_array(root.get("strengths"), "strengths", 10, 240)?;
    let gaps = string_array(root.get("gaps"), "gaps", 10, 240)?;
    let keywords = string_array(root.get("keywords"), "keywords", 24, 60)?;
    let resume_changes = string_array(root.get("resumeChanges"), "resumeChanges", 12, 240)?;
    if strengths.is_empty() || gaps.is_empty() || keywords.is_empty() || resume_changes.is_empty() {
        return Err("岗位分析的优势、差距、关键词和简历改动均不能为空".to_string());
    }

    let raw_questions = root
        .get("interviewQuestions")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 interviewQuestions 数组".to_string())?;
    if !(6..=20).contains(&raw_questions.len()) {
        return Err("针对性面试题需为 6 到 20 道".to_string());
    }
    let mut interview_questions = Vec::with_capacity(raw_questions.len());
    let mut seen_questions = HashSet::new();
    for (index, raw) in raw_questions.iter().enumerate() {
        let question = required_string(raw, "question", 300)
            .map_err(|error| format!("第 {} 道岗位面试题无效：{error}", index + 1))?;
        let dedupe_key = question
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        if !seen_questions.insert(dedupe_key) {
            continue;
        }
        let answer_guide = string_array(raw.get("answerGuide"), "answerGuide", 6, 300)
            .map_err(|error| format!("第 {} 道岗位面试题无效：{error}", index + 1))?;
        if !(2..=6).contains(&answer_guide.len()) {
            return Err(format!(
                "第 {} 道岗位面试题的回答提纲需为 2 到 6 条",
                index + 1
            ));
        }
        interview_questions.push(GeneratedJobInterviewQuestion {
            question,
            category: required_string(raw, "category", 60)
                .map_err(|error| format!("第 {} 道岗位面试题无效：{error}", index + 1))?,
            difficulty: parse_difficulty(raw.get("difficulty")),
            why_asked: required_string(raw, "whyAsked", 500)
                .map_err(|error| format!("第 {} 道岗位面试题无效：{error}", index + 1))?,
            answer_guide,
        });
    }
    if interview_questions.len() < 6 {
        return Err("模型返回的有效且不重复的岗位面试题少于 6 道".to_string());
    }

    let optimized_resume = root
        .get("optimizedResume")
        .ok_or_else(|| "模型结果缺少 optimizedResume 对象".to_string())
        .and_then(parse_generated_resume_value)?;

    Ok(GeneratedJobApplicationAnalysis {
        target_role,
        match_score,
        summary,
        strengths,
        gaps,
        keywords,
        resume_changes,
        interview_questions,
        optimized_resume,
    })
}

pub fn parse_job_interview_focus(content: &str) -> Result<GeneratedJobInterviewFocus, String> {
    let root = parse_json_object_response(content)?;
    let target_role = required_string(&root, "targetRole", 120)?;
    let overview = required_string(&root, "overview", 1_000)?;
    let keywords = string_array(root.get("keywords"), "keywords", 24, 60)?;
    if keywords.is_empty() {
        return Err("面试重点中的 JD 关键词不能为空".to_string());
    }

    let raw_areas = root
        .get("focusAreas")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "模型结果缺少 focusAreas 数组".to_string())?;
    if !(4..=10).contains(&raw_areas.len()) {
        return Err("面试重点需包含 4 到 10 个主题".to_string());
    }

    let mut focus_areas = Vec::with_capacity(raw_areas.len());
    let mut seen_titles = HashSet::new();
    for (index, raw) in raw_areas.iter().enumerate() {
        let title = required_string(raw, "title", 120)
            .map_err(|error| format!("第 {} 个面试重点无效：{error}", index + 1))?;
        let dedupe_key = title
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        if !seen_titles.insert(dedupe_key) {
            continue;
        }
        let priority = raw
            .get("priority")
            .and_then(serde_json::Value::as_u64)
            .filter(|priority| (1..=3).contains(priority))
            .and_then(|priority| u8::try_from(priority).ok())
            .ok_or_else(|| format!("第 {} 个面试重点的 priority 必须是 1、2 或 3", index + 1))?;
        let key_points = string_array(raw.get("keyPoints"), "keyPoints", 6, 300)
            .map_err(|error| format!("第 {} 个面试重点无效：{error}", index + 1))?;
        if !(2..=6).contains(&key_points.len()) {
            return Err(format!(
                "第 {} 个面试重点的复习要点需为 2 到 6 条",
                index + 1
            ));
        }
        let likely_questions = string_array(raw.get("likelyQuestions"), "likelyQuestions", 5, 300)
            .map_err(|error| format!("第 {} 个面试重点无效：{error}", index + 1))?;
        if likely_questions.is_empty() {
            return Err(format!("第 {} 个面试重点至少需要 1 道可能追问", index + 1));
        }

        focus_areas.push(GeneratedJobInterviewFocusArea {
            title,
            priority,
            reason: required_string(raw, "reason", 500)
                .map_err(|error| format!("第 {} 个面试重点无效：{error}", index + 1))?,
            key_points,
            likely_questions,
        });
    }
    if focus_areas.len() < 4 {
        return Err("模型返回的有效且不重复的面试重点少于 4 个".to_string());
    }

    let preparation_checklist = string_array(
        root.get("preparationChecklist"),
        "preparationChecklist",
        10,
        300,
    )?;
    if preparation_checklist.len() < 3 {
        return Err("面试前准备清单至少需要 3 项".to_string());
    }

    Ok(GeneratedJobInterviewFocus {
        target_role,
        overview,
        keywords,
        focus_areas,
        preparation_checklist,
    })
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
        parse_generated_resume, parse_job_application_analysis, parse_job_interview_focus,
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

    #[test]
    fn parses_and_normalizes_generated_resume() {
        let content = r#"```json
        {
          "personal": {
            "name": "张三",
            "headline": "Go 后端工程师",
            "phone": "13800000000",
            "email": "zhangsan@example.com",
            "location": "上海",
            "website": "github.com/zhangsan"
          },
          "summary": "三年后端开发经验，关注高并发与稳定性建设。",
          "skills": [{"category":"后端","items":["Go","MySQL","Redis","Go"]}],
          "experience": [{
            "company": "示例科技",
            "role": "后端工程师",
            "startDate": "2023.06",
            "endDate": "至今",
            "highlights": ["负责订单服务开发与稳定性治理"]
          }],
          "projects": [{
            "name": "订单平台",
            "role": "核心开发",
            "startDate": "2024.01",
            "endDate": "2025.06",
            "summary": "面向电商场景的订单服务。",
            "highlights": ["设计幂等与补偿机制"],
            "technologies": ["Go","Kafka"]
          }],
          "education": [{
            "school": "示例大学",
            "degree": "本科",
            "major": "计算机科学",
            "startDate": "2019.09",
            "endDate": "2023.06",
            "highlights": []
          }]
        }
        ```"#;

        let resume = parse_generated_resume(content).unwrap();
        assert_eq!(resume.personal.name, "张三");
        assert_eq!(resume.skills[0].items, vec!["Go", "MySQL", "Redis"]);
        assert_eq!(resume.experience[0].start_date, "2023.06");
        assert_eq!(resume.projects[0].technologies, vec!["Go", "Kafka"]);
        assert_eq!(resume.education[0].major, "计算机科学");
    }

    #[test]
    fn parses_job_application_analysis_with_optimized_resume() {
        let questions = (1..=6)
            .map(|index| {
                serde_json::json!({
                    "question": format!("第 {index} 道岗位问题是什么？"),
                    "category": "项目深挖",
                    "difficulty": 2,
                    "whyAsked": "验证候选人的实际项目经验",
                    "answerGuide": ["说明项目背景和个人职责", "结合已有经历说明技术取舍"]
                })
            })
            .collect::<Vec<_>>();
        let content = serde_json::json!({
            "targetRole": "Go 后端工程师",
            "matchScore": 82,
            "summary": "后端基础匹配，系统设计经验需要进一步验证。",
            "strengths": ["已有 Go 服务开发经验"],
            "gaps": ["简历未体现大规模系统容量"],
            "keywords": ["Go", "MySQL", "Redis"],
            "resumeChanges": ["将岗位相关技能前置"],
            "interviewQuestions": questions,
            "optimizedResume": {
                "personal": {
                    "name": "张三",
                    "headline": "Go 后端工程师",
                    "phone": "",
                    "email": "",
                    "location": "上海",
                    "website": ""
                },
                "summary": "三年后端服务开发经验。",
                "skills": [{"category": "后端", "items": ["Go", "MySQL"]}],
                "experience": [{
                    "company": "示例科技",
                    "role": "后端工程师",
                    "startDate": "2023.06",
                    "endDate": "至今",
                    "highlights": ["负责订单服务开发"]
                }],
                "projects": [],
                "education": []
            }
        })
        .to_string();

        let analysis = parse_job_application_analysis(&content).unwrap();
        assert_eq!(analysis.target_role, "Go 后端工程师");
        assert_eq!(analysis.match_score, 82);
        assert_eq!(analysis.interview_questions.len(), 6);
        assert_eq!(analysis.optimized_resume.personal.name, "张三");
    }

    #[test]
    fn parses_job_interview_focus_with_prioritized_areas() {
        let focus_areas = (1..=4)
            .map(|index| {
                serde_json::json!({
                    "title": format!("重点主题 {index}"),
                    "priority": if index == 1 { 3 } else { 2 },
                    "reason": "JD 明确要求掌握该能力",
                    "keyPoints": ["复习核心原理", "准备项目中的实际取舍"],
                    "likelyQuestions": ["请结合项目说明你如何应用这项能力？"]
                })
            })
            .collect::<Vec<_>>();
        let content = serde_json::json!({
            "targetRole": "Go 后端工程师",
            "overview": "重点考察服务端基础与高并发系统设计。",
            "keywords": ["Go", "MySQL", "Redis"],
            "focusAreas": focus_areas,
            "preparationChecklist": ["准备项目案例", "复盘技术取舍", "整理反问问题"]
        })
        .to_string();

        let focus = parse_job_interview_focus(&content).unwrap();
        assert_eq!(focus.target_role, "Go 后端工程师");
        assert_eq!(focus.focus_areas.len(), 4);
        assert_eq!(focus.focus_areas[0].priority, 3);
        assert_eq!(focus.preparation_checklist.len(), 3);
    }

    #[test]
    fn rejects_job_interview_focus_with_invalid_priority() {
        let content = serde_json::json!({
            "targetRole": "产品经理",
            "overview": "重点考察产品判断。",
            "keywords": ["需求分析"],
            "focusAreas": (1..=4).map(|index| serde_json::json!({
                "title": format!("主题 {index}"),
                "priority": 4,
                "reason": "JD 明确要求",
                "keyPoints": ["要点一", "要点二"],
                "likelyQuestions": ["问题一"]
            })).collect::<Vec<_>>(),
            "preparationChecklist": ["准备一", "准备二", "准备三"]
        })
        .to_string();

        assert!(parse_job_interview_focus(&content)
            .unwrap_err()
            .contains("priority 必须是 1、2 或 3"));
    }

    #[test]
    fn rejects_resume_without_any_experience_section() {
        let content = r#"{
          "personal": {"name":"候选人","headline":"产品经理"},
          "summary": "有产品设计与协作经验。",
          "skills": [{"category":"产品","items":["需求分析"]}],
          "experience": [],
          "projects": [],
          "education": []
        }"#;

        assert!(parse_generated_resume(content)
            .unwrap_err()
            .contains("工作、项目或教育经历"));
    }
}
