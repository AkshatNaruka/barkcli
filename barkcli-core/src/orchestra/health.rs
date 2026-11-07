use serde::{Deserialize, Serialize};

/// Availability/eligibility state for a catalog entry.
/// Catalog presence is not proof of usable access.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ModelAvailability {
    #[default]
    Discovered,
    Configured,
    Ready,
    Unverified,
    RateLimited,
    QuotaExhausted,
    AuthRequired,
    Unsupported,
    Offline,
    Disabled,
}

impl ModelAvailability {
    pub fn is_auto_eligible(self) -> bool {
        matches!(self, Self::Ready)
    }

    pub fn blocks_execution(self) -> bool {
        matches!(
            self,
            Self::RateLimited
                | Self::QuotaExhausted
                | Self::AuthRequired
                | Self::Unsupported
                | Self::Offline
                | Self::Disabled
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ready_is_auto_eligible() {
        assert!(ModelAvailability::Ready.is_auto_eligible());
        assert!(!ModelAvailability::Unverified.is_auto_eligible());
        assert!(!ModelAvailability::Discovered.is_auto_eligible());
    }
}
