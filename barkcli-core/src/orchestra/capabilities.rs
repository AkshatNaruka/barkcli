use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelCapabilitiesInfo {
    #[serde(default)]
    pub tool_calling: Option<bool>,
    #[serde(default)]
    pub vision: Option<bool>,
    #[serde(default)]
    pub structured_output: Option<bool>,
    #[serde(default)]
    pub context_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    /// Unknown capabilities are treated conservatively by eligibility checks.
    #[serde(default)]
    pub streaming: Option<bool>,
}

impl ModelCapabilitiesInfo {
    pub fn satisfies(&self, req: &ModelRequirement) -> bool {
        if req.tool_calling && self.tool_calling != Some(true) {
            return false;
        }
        if req.vision && self.vision != Some(true) {
            return false;
        }
        if req.structured_output && self.structured_output != Some(true) {
            return false;
        }
        if let Some(min) = req.min_context_tokens {
            if self.context_tokens.unwrap_or(0) < min {
                return false;
            }
        }
        true
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelRequirement {
    #[serde(default)]
    pub tool_calling: bool,
    #[serde(default)]
    pub vision: bool,
    #[serde(default)]
    pub structured_output: bool,
    #[serde(default)]
    pub min_context_tokens: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_tool_calling_fails_tool_requirement() {
        let caps = ModelCapabilitiesInfo::default();
        let req = ModelRequirement {
            tool_calling: true,
            ..Default::default()
        };
        assert!(!caps.satisfies(&req));
        let caps = ModelCapabilitiesInfo {
            tool_calling: Some(true),
            ..Default::default()
        };
        assert!(caps.satisfies(&req));
    }
}
