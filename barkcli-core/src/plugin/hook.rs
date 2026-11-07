use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;

/// Hook points for key operations
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum HookPoint {
    // Lifecycle hooks
    BeforeInit,
    AfterInit,
    BeforeShutdown,
    AfterShutdown,

    // Command hooks
    BeforeCommand,
    AfterCommand,
    BeforeDispatch,
    AfterDispatch,

    // Run/autopilot hooks
    BeforeRun,
    AfterRun,
    BeforePlan,
    AfterPlan,
    BeforeDispatchTask,
    AfterDispatchTask,

    // Review/merge hooks
    BeforeReview,
    AfterReview,
    BeforeMerge,
    AfterMerge,
    BeforeGuard,
    AfterGuard,

    // Provider hooks
    BeforeProviderCall,
    AfterProviderCall,

    // Custom hook points
    Custom(String),
}

/// Context passed to hooks
#[derive(Debug, Clone)]
pub struct HookContext {
    pub data: HashMap<String, serde_json::Value>,
}

impl HookContext {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    pub fn insert(&mut self, key: impl Into<String>, value: serde_json::Value) {
        self.data.insert(key.into(), value);
    }

    pub fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.data.get(key)
    }
}

impl Default for HookContext {
    fn default() -> Self {
        Self::new()
    }
}

/// Result from hook execution
#[derive(Debug, Clone)]
pub struct HookResult {
    pub continue_execution: bool,
    pub data: HashMap<String, serde_json::Value>,
    pub messages: Vec<String>,
}

impl Default for HookResult {
    fn default() -> Self {
        Self {
            continue_execution: true,
            data: HashMap::new(),
            messages: vec![],
        }
    }
}

/// Hook trait
pub trait Hook: Send + Sync {
    fn name(&self) -> &str;
    fn priority(&self) -> i32 {
        0
    }
    fn call(&self, ctx: &HookContext) -> Result<HookResult>;
}

/// Hook registry
#[derive(Default)]
pub struct HookRegistry {
    hooks: HashMap<HookPoint, Vec<Arc<dyn Hook>>>,
}

impl HookRegistry {
    pub fn new() -> Self {
        Self {
            hooks: HashMap::new(),
        }
    }

    pub fn register(&mut self, point: HookPoint, hook: Arc<dyn Hook>) {
        let point_key = point.clone();
        self.hooks.entry(point).or_default().push(hook);
        // Sort by priority (higher priority first)
        if let Some(hooks_list) = self.hooks.get_mut(&point_key) {
            hooks_list.sort_by(|a, b| b.priority().cmp(&a.priority()));
        }
    }

    pub fn run(&self, point: HookPoint, ctx: &HookContext) -> Result<HookResult> {
        let mut result = HookResult::default();
        if let Some(hooks_list) = self.hooks.get(&point) {
            for hook in hooks_list {
                let hook_result = hook.call(ctx)?;
                result.continue_execution &= hook_result.continue_execution;
                result.data.extend(hook_result.data.clone());
                result.messages.extend(hook_result.messages.clone());
                if !result.continue_execution {
                    break;
                }
            }
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestHook;

    impl Hook for TestHook {
        fn name(&self) -> &str {
            "test"
        }
        fn call(&self, _ctx: &HookContext) -> Result<HookResult> {
            Ok(HookResult {
                messages: vec!["test message".to_string()],
                ..Default::default()
            })
        }
    }

    #[test]
    fn test_hook_registry() {
        let mut registry = HookRegistry::new();
        registry.register(HookPoint::BeforeRun, Arc::new(TestHook));
        let ctx = HookContext::new();
        let result = registry.run(HookPoint::BeforeRun, &ctx).unwrap();
        assert!(result.continue_execution);
        assert_eq!(result.messages.len(), 1);
    }
}
