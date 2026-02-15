use crate::llm::auth::api_key_manager::ApiKeyManager;
use crate::llm::image_generation::aigateway::AIGatewayImageClient;
use crate::llm::image_generation::dashscope::DashScopeImageClient;
use crate::llm::image_generation::google::GoogleImageClient;
use crate::llm::image_generation::openai::OpenAiImageClient;
use crate::llm::image_generation::types::{ImageGenerationRequest, ImageGenerationResponse};
use crate::llm::image_generation::volcengine::VolcengineImageClient;
use crate::llm::image_generation::zhipu::ZhipuImageClient;
use crate::llm::models::model_registry::ModelRegistry;
use crate::llm::providers::provider_registry::ProviderRegistry;
use crate::llm::types::CustomProvidersConfiguration;
use crate::llm::types::ModelsConfiguration;

/// Settings key for image generator model type
const IMAGE_GENERATOR_MODEL_TYPE_KEY: &str = "model_type_image_generator";
/// Default image generator model
const DEFAULT_IMAGE_GENERATOR_MODEL: &str = "gemini-3-pro-image";

pub struct ImageGenerationService;

impl ImageGenerationService {
    pub async fn generate(
        api_keys: &ApiKeyManager,
        registry: &ProviderRegistry,
        custom_providers: &CustomProvidersConfiguration,
        models: &ModelsConfiguration,
        request: ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse, String> {
        let api_map = api_keys.load_api_keys().await?;

        // Resolve model: use provided model, or auto-select if empty
        let model_identifier = if request.model.trim().is_empty() {
            Self::resolve_image_generator_model(
                api_keys,
                registry,
                custom_providers,
                models,
                &api_map,
            )
            .await?
        } else {
            request.model.clone()
        };

        let (model_key, provider_id) = ModelRegistry::get_model_provider(
            &model_identifier,
            &api_map,
            registry,
            custom_providers,
            models,
        )?;

        let provider_model_name =
            ModelRegistry::resolve_provider_model_name(&model_key, &provider_id, models);

        match provider_id.as_str() {
            "openai" => {
                let provider = registry
                    .provider(&provider_id)
                    .ok_or_else(|| "OpenAI provider not configured".to_string())?;
                let client = OpenAiImageClient::new(provider.clone());
                let images = client
                    .generate(api_keys, &provider_model_name, request)
                    .await?;
                Ok(ImageGenerationResponse {
                    provider: provider_id,
                    images,
                    request_id: None,
                })
            }
            "aiGateway" => {
                let provider = registry
                    .provider(&provider_id)
                    .ok_or_else(|| "aiGateway provider not configured".to_string())?;
                let client = AIGatewayImageClient::new(provider.clone());
                let images = client
                    .generate(api_keys, &provider_model_name, request)
                    .await?;
                Ok(ImageGenerationResponse {
                    provider: provider_id,
                    images,
                    request_id: None,
                })
            }
            "google" => {
                let provider = registry
                    .provider(&provider_id)
                    .ok_or_else(|| "Google provider not configured".to_string())?;
                let client = GoogleImageClient::with_base_url(provider.base_url.clone());
                let images = client
                    .generate(api_keys, &provider_model_name, request)
                    .await?;
                Ok(ImageGenerationResponse {
                    provider: provider_id,
                    images,
                    request_id: None,
                })
            }
            "volcengine" => {
                let provider = registry
                    .provider(&provider_id)
                    .ok_or_else(|| "Volcengine provider not configured".to_string())?;
                let client = VolcengineImageClient::new(provider.clone());
                let images = client
                    .generate(api_keys, &provider_model_name, request)
                    .await?;
                Ok(ImageGenerationResponse {
                    provider: provider_id,
                    images,
                    request_id: None,
                })
            }
            "zhipu" => {
                let provider = registry
                    .provider(&provider_id)
                    .ok_or_else(|| "Zhipu AI provider not configured".to_string())?;
                let client = ZhipuImageClient::new(provider.clone());
                let images = client
                    .generate(api_keys, &provider_model_name, request)
                    .await?;
                Ok(ImageGenerationResponse {
                    provider: provider_id,
                    images,
                    request_id: None,
                })
            }
            "alibaba" => {
                let provider = registry
                    .provider(&provider_id)
                    .ok_or_else(|| "Alibaba provider not configured".to_string())?;
                let client = DashScopeImageClient::new(provider.clone());
                let images = client
                    .generate(api_keys, &provider_model_name, request)
                    .await?;
                Ok(ImageGenerationResponse {
                    provider: provider_id,
                    images,
                    request_id: None,
                })
            }
            _ => Err(format!(
                "Image generation provider not supported: {} / 不支持的图片生成供应商: {}",
                provider_id, provider_id
            )),
        }
    }

    /// Automatically resolve an available image generator model
    /// 1. First, check if user has configured a model in settings (model_type_image_generator)
    /// 2. Otherwise, find any available model with image_output capability
    pub(crate) async fn resolve_image_generator_model(
        api_keys: &ApiKeyManager,
        registry: &ProviderRegistry,
        custom_providers: &CustomProvidersConfiguration,
        models: &ModelsConfiguration,
        api_map: &std::collections::HashMap<String, String>,
    ) -> Result<String, String> {
        // Step 1: Try to get configured model from settings
        if let Ok(Some(configured_model)) =
            api_keys.get_setting(IMAGE_GENERATOR_MODEL_TYPE_KEY).await
        {
            let configured_model = configured_model.trim();
            if !configured_model.is_empty() {
                // Check if the configured model is available
                if let Ok((_, _)) = ModelRegistry::get_model_provider(
                    configured_model,
                    api_map,
                    registry,
                    custom_providers,
                    models,
                ) {
                    log::info!(
                        "[ImageGenerationService] Using configured image generator model: {}",
                        configured_model
                    );
                    return Ok(configured_model.to_string());
                }
                log::warn!(
                    "[ImageGenerationService] Configured model {} is not available, falling back",
                    configured_model
                );
            }
        }

        // Step 2: Try default image generator model
        if let Ok((_, _)) = ModelRegistry::get_model_provider(
            DEFAULT_IMAGE_GENERATOR_MODEL,
            api_map,
            registry,
            custom_providers,
            models,
        ) {
            log::info!(
                "[ImageGenerationService] Using default image generator model: {}",
                DEFAULT_IMAGE_GENERATOR_MODEL
            );
            return Ok(DEFAULT_IMAGE_GENERATOR_MODEL.to_string());
        }

        // Step 3: Find any available model with image_output capability
        for (model_key, model_config) in &models.models {
            if model_config.image_output {
                if let Ok((_, provider_id)) = ModelRegistry::get_model_provider(
                    model_key,
                    api_map,
                    registry,
                    custom_providers,
                    models,
                ) {
                    log::info!(
                        "[ImageGenerationService] Auto-selected image generator model: {}@{}",
                        model_key,
                        provider_id
                    );
                    return Ok(format!("{}@{}", model_key, provider_id));
                }
            }
        }

        Err(
            "No available image generation model found. Please configure an image generator model in settings. \
             / 未找到可用的图片生成模型，请在设置中配置图片生成模型。"
                .to_string(),
        )
    }
}
