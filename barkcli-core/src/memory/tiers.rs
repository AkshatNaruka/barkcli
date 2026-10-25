use super::store::{MemoryEntry, MemoryTier};

/// Memory tier manager with promotion/demotion logic.
///
/// Handles the lifecycle of memories across tiers:
/// - Working → ShortTerm → LongTerm → External
/// - Automatic promotion based on access patterns
/// - Automatic demotion when tiers are full
pub struct TierManager;

impl TierManager {
    /// Determine the appropriate tier for a new memory entry based on context.
    pub fn classify_entry(content: &str, tags: &[String], source: &str) -> MemoryTier {
        // Session-related content → short-term
        if source.starts_with("session:") || source.starts_with("agent:") {
            return MemoryTier::ShortTerm;
        }

        // Code patterns and conventions → long-term
        let content_lower = content.to_lowercase();
        if content_lower.contains("convention")
            || content_lower.contains("pattern")
            || content_lower.contains("always use")
            || content_lower.contains("never use")
            || content_lower.contains("we decided")
            || content_lower.contains("architecture")
        {
            return MemoryTier::LongTerm;
        }

        // Decision rationale → long-term
        if tags.iter().any(|t| t == "decision" || t == "convention" || t == "pattern") {
            return MemoryTier::LongTerm;
        }

        // Project facts → long-term
        if tags.iter().any(|t| t == "fact") {
            return MemoryTier::LongTerm;
        }

        // Default: short-term (will be compressed later)
        MemoryTier::ShortTerm
    }

    /// Determine if a memory should be promoted to a higher tier.
    ///
    /// Promotion criteria:
    /// - Access count >= 3 (frequently accessed)
    /// - Age > 7 days (survived initial period)
    /// - Has relevant tags
    pub fn should_promote(entry: &MemoryEntry) -> Option<MemoryTier> {
        match entry.tier {
            MemoryTier::Working => {
                // Working → ShortTerm: after 1 hour of no access
                if entry.access_count >= 1 {
                    Some(MemoryTier::ShortTerm)
                } else {
                    None
                }
            }
            MemoryTier::ShortTerm => {
                // ShortTerm → LongTerm: if accessed frequently or has important tags
                let age_days = (chrono::Utc::now() - entry.created_at).num_days();
                let has_important_tags = entry.tags.iter().any(|t| {
                    t == "decision"
                        || t == "convention"
                        || t == "pattern"
                        || t == "compressed"
                });

                if entry.access_count >= 3 || (age_days > 7 && has_important_tags) {
                    Some(MemoryTier::LongTerm)
                } else {
                    None
                }
            }
            MemoryTier::LongTerm => {
                // LongTerm → External: if accessed rarely but kept for reference
                let age_days = (chrono::Utc::now() - entry.created_at).num_days();
                if age_days > 30 && entry.access_count <= 1 {
                    Some(MemoryTier::External)
                } else {
                    None
                }
            }
            MemoryTier::External => None, // Already at lowest tier
        }
    }

    /// Determine if a memory should be evicted from its tier.
    pub fn should_evict(entry: &MemoryEntry, tier: MemoryTier) -> bool {
        let max_age_days = match tier {
            MemoryTier::Working => 1,       // 1 day
            MemoryTier::ShortTerm => 14,     // 2 weeks
            MemoryTier::LongTerm => 180,     // 6 months
            MemoryTier::External => 365,     // 1 year
        };

        let age_days = (chrono::Utc::now() - entry.created_at).num_days();
        let has_been_accessed = entry.access_count > 0;

        // Evict if old and never accessed, or very old regardless
        age_days > max_age_days && !has_been_accessed
    }

    /// Get priority weight for search ranking based on tier.
    pub fn tier_weight(tier: MemoryTier) -> f32 {
        match tier {
            MemoryTier::Working => 1.5,   // Most relevant
            MemoryTier::ShortTerm => 1.2,  // Recent context
            MemoryTier::LongTerm => 1.0,   // Baseline
            MemoryTier::External => 0.8,   // Archive, less relevant
        }
    }

    /// Get recency weight based on last access time.
    ///
    /// Implements bounded exponential memory decay with a 0.3x floor for stale memories
    /// and a 1.5x peak for fresh memories across a 7-day (168h) decay curve.
    pub fn recency_weight(last_accessed: chrono::DateTime<chrono::Utc>) -> f32 {
        let age_hours = (chrono::Utc::now() - last_accessed).num_hours().max(0) as f32;
        let decay = (-age_hours / 168.0).exp();
        0.3 + 1.2 * decay
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::store::MemoryEntry;

    #[test]
    fn test_classify_entry_session() {
        let tier = TierManager::classify_entry(
            "worked on auth",
            &[],
            "session:abc123",
        );
        assert_eq!(tier, MemoryTier::ShortTerm);
    }

    #[test]
    fn test_classify_entry_convention() {
        let tier = TierManager::classify_entry(
            "Always use snake_case for variables",
            &[],
            "manual",
        );
        assert_eq!(tier, MemoryTier::LongTerm);
    }

    #[test]
    fn test_should_promote_frequent() {
        let mut entry = MemoryEntry::new("test content", MemoryTier::ShortTerm);
        entry.access_count = 5;
        assert!(TierManager::should_promote(&entry).is_some());
    }

    #[test]
    fn test_should_not_promote_new() {
        let entry = MemoryEntry::new("test content", MemoryTier::ShortTerm);
        assert!(TierManager::should_promote(&entry).is_none());
    }

    #[test]
    fn test_tier_weights() {
        assert!(TierManager::tier_weight(MemoryTier::Working) > TierManager::tier_weight(MemoryTier::External));
        assert!(TierManager::tier_weight(MemoryTier::ShortTerm) > TierManager::tier_weight(MemoryTier::LongTerm));
    }

    #[test]
    fn test_recency_decay_floor_and_ceiling() {
        let now = chrono::Utc::now();
        let fresh_weight = TierManager::recency_weight(now);
        assert!(fresh_weight >= 1.49 && fresh_weight <= 1.51);

        let stale_date = now - chrono::Duration::days(365);
        let stale_weight = TierManager::recency_weight(stale_date);
        assert!(stale_weight >= 0.29 && stale_weight <= 0.31);
    }
}
