// Kimi Coding Plan Provider Implementation
// Uses the coding plan endpoint with special KimiCLI User-Agent header

use crate::llm::auth::api_key_manager::ApiKeyManager;
use crate::llm::protocols::{
    header_builder::{HeaderBuildContext, ProtocolHeaderBuilder},
    openai_protocol::OpenAiProtocol,
    request_builder::ProtocolRequestBuilder,
    stream_parser::ProtocolStreamParser,
};
use crate::llm::providers::provider::{
    BaseProvider, Provider, ProviderContext, ProviderCredentials as Creds,
};
use crate::llm::types::{ProtocolType, ProviderConfig};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;

pub struct KimiCodingProvider {
    base: BaseProvider,
    protocol: OpenAiProtocol,
}

impl KimiCodingProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            base: BaseProvider::new(config),
            protocol: OpenAiProtocol,
        }
    }
}

#[async_trait]
impl Provider for KimiCodingProvider {
    fn id(&self) -> &str {
        &self.base.config.id
    }

    fn name(&self) -> &str {
        &self.base.config.name
    }

    fn protocol_type(&self) -> ProtocolType {
        self.base.config.protocol
    }

    fn config(&self) -> &ProviderConfig {
        &self.base.config
    }

    async fn resolve_base_url(&self, ctx: &ProviderContext<'_>) -> Result<String, String> {
        // Use standard endpoint resolution
        self.base
            .resolve_base_url_with_fallback(ctx.api_key_manager)
            .await
    }

    async fn get_credentials(&self, api_key_manager: &ApiKeyManager) -> Result<Creds, String> {
        let key_value = api_key_manager
            .get_setting(&self.base.config.api_key_name)
            .await?
            .ok_or_else(|| format!("API key '{}' not found", self.base.config.api_key_name))?;

        Ok(Creds::ApiKey(key_value))
    }

    async fn add_provider_headers(
        &self,
        _ctx: &ProviderContext<'_>,
        headers: &mut HashMap<String, String>,
    ) -> Result<(), String> {
        // Add KimiCLI User-Agent for coding plan endpoint
        headers.insert("User-Agent".to_string(), "KimiCLI/1.3".to_string());
        Ok(())
    }

    fn build_protocol_headers(&self, ctx: HeaderBuildContext) -> HashMap<String, String> {
        self.protocol.build_base_headers(ctx)
    }

    fn build_protocol_request(
        &self,
        ctx: crate::llm::protocols::request_builder::RequestBuildContext,
    ) -> Result<Value, String> {
        self.protocol.build_request(ctx)
    }

    fn parse_protocol_stream_event(
        &self,
        ctx: crate::llm::protocols::stream_parser::StreamParseContext,
        state: &mut crate::llm::protocols::stream_parser::StreamParseState,
    ) -> Result<Option<crate::llm::types::StreamEvent>, String> {
        self.protocol.parse_stream_event(ctx, state)
    }
}
