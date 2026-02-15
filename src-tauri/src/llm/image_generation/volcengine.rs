use crate::llm::auth::api_key_manager::ApiKeyManager;
use crate::llm::image_generation::types::{GeneratedImage, ImageGenerationRequest};
use crate::llm::providers::provider::BaseProvider;
use crate::llm::types::ProviderConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Request format for Volcengine/ByteDance Seedream image generation
/// Follows OpenAI-compatible format
#[derive(Debug, Clone, Serialize)]
struct VolcengineImageRequest {
    model: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    n: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<String>,
}

/// Response format from Volcengine image generation API
#[derive(Debug, Clone, Deserialize)]
struct VolcengineImageResponse {
    data: Vec<VolcengineImageData>,
}

#[derive(Debug, Clone, Deserialize)]
struct VolcengineImageData {
    #[serde(rename = "b64_json")]
    b64_json: Option<String>,
    url: Option<String>,
    #[serde(rename = "revised_prompt")]
    revised_prompt: Option<String>,
}

pub struct VolcengineImageClient {
    config: ProviderConfig,
}

impl VolcengineImageClient {
    pub fn new(config: ProviderConfig) -> Self {
        Self { config }
    }

    pub async fn generate(
        &self,
        api_keys: &ApiKeyManager,
        model: &str,
        request: ImageGenerationRequest,
    ) -> Result<Vec<GeneratedImage>, String> {
        let credentials = api_keys.get_credentials(&self.config).await?;
        let api_key = match credentials {
            crate::llm::auth::api_key_manager::ProviderCredentials::Token(token) => token,
            crate::llm::auth::api_key_manager::ProviderCredentials::None => {
                return Err(
                    "API key not configured for Volcengine image generation / Volcengine 图片生成未配置 API 密钥"
                        .to_string(),
                )
            }
        };

        let base = BaseProvider::new(self.config.clone());
        let base_url = base.resolve_base_url_with_fallback(api_keys).await?;
        let url = format!("{}/images/generations", base_url.trim_end_matches('/'));

        let body = VolcengineImageRequest {
            model: model.to_string(),
            prompt: request.prompt,
            size: request.size,
            quality: request.quality,
            n: request.n,
            response_format: request.response_format,
        };

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        headers.insert("Authorization".to_string(), format!("Bearer {}", api_key));

        let mut header_map = reqwest::header::HeaderMap::new();
        for (key, value) in headers {
            let header_name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
                .map_err(|e| format!("Invalid header name {}: {}", key, e))?;
            let header_value = reqwest::header::HeaderValue::from_str(&value)
                .map_err(|e| format!("Invalid header value for {}: {}", key, e))?;
            header_map.insert(header_name, header_value);
        }

        let response = client
            .post(&url)
            .headers(header_map)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Volcengine image request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!(
                "Volcengine image generation failed ({}): {} / Volcengine 图片生成失败",
                status, body
            ));
        }

        let payload = response
            .json::<VolcengineImageResponse>()
            .await
            .map_err(|e| format!("Failed to parse Volcengine response: {}", e))?;

        let images = payload
            .data
            .into_iter()
            .map(|item| GeneratedImage {
                b64_json: item.b64_json,
                url: item.url,
                mime_type: "image/png".to_string(),
                revised_prompt: item.revised_prompt,
            })
            .collect();

        Ok(images)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_volcengine_image_response_with_b64() {
        let json = r#"{"data":[{"b64_json":"abc123","revised_prompt":"refined prompt"}]}"#;
        let parsed: VolcengineImageResponse = serde_json::from_str(json).expect("parse response");
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(parsed.data[0].b64_json.as_deref(), Some("abc123"));
        assert_eq!(
            parsed.data[0].revised_prompt.as_deref(),
            Some("refined prompt")
        );
    }

    #[test]
    fn parses_volcengine_image_response_with_url() {
        let json = r#"{"data":[{"url":"https://example.com/image.png"}]}"#;
        let parsed: VolcengineImageResponse = serde_json::from_str(json).expect("parse response");
        assert_eq!(parsed.data.len(), 1);
        assert_eq!(
            parsed.data[0].url.as_deref(),
            Some("https://example.com/image.png")
        );
    }

    #[test]
    fn volcengine_image_client_constructs() {
        let config = ProviderConfig {
            id: "volcengine".to_string(),
            name: "Volcengine".to_string(),
            protocol: crate::llm::types::ProtocolType::OpenAiCompatible,
            base_url: "https://ark.cn-beijing.volces.com/api/v3".to_string(),
            api_key_name: "VOLCENGINE_API_KEY".to_string(),
            supports_oauth: false,
            supports_coding_plan: false,
            supports_international: false,
            coding_plan_base_url: None,
            international_base_url: None,
            headers: None,
            extra_body: None,
            auth_type: crate::llm::types::AuthType::Bearer,
        };
        let _client = VolcengineImageClient::new(config);
    }
}
