import Foundation

public struct UsageResponseData: Codable, Sendable {
    public let summary: UsageSummary
    public let models: [ModelUsage]
    public let providers: [ProviderUsage]
    public let daily: [DailyUsage]
    public let limits: [ProviderLimit]

    public init(
        summary: UsageSummary,
        models: [ModelUsage],
        providers: [ProviderUsage],
        daily: [DailyUsage],
        limits: [ProviderLimit]
    ) {
        self.summary = summary
        self.models = models
        self.providers = providers
        self.daily = daily
        self.limits = limits
    }
}

public struct UsageSummary: Codable, Sendable {
    public let totalTokens: Int
    public let inputTokens: Int
    public let outputTokens: Int
    public let cachedInputTokens: Int
    public let cacheHitRate: Double
    public let totalCostUsd: Double
    public let standardCostUsd: Double
    public let premiumCostUsd: Double
    public let totalRuns: Int
    public let activeProviders: Int
    public let activeModels: Int

    enum CodingKeys: String, CodingKey {
        case totalTokens = "total_tokens"
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cachedInputTokens = "cached_input_tokens"
        case cacheHitRate = "cache_hit_rate"
        case totalCostUsd = "total_cost_usd"
        case standardCostUsd = "standard_cost_usd"
        case premiumCostUsd = "premium_cost_usd"
        case totalRuns = "total_runs"
        case activeProviders = "active_providers"
        case activeModels = "active_models"
    }

    public init(
        totalTokens: Int = 0,
        inputTokens: Int = 0,
        outputTokens: Int = 0,
        cachedInputTokens: Int = 0,
        cacheHitRate: Double = 0.0,
        totalCostUsd: Double = 0.0,
        standardCostUsd: Double = 0.0,
        premiumCostUsd: Double = 0.0,
        totalRuns: Int = 0,
        activeProviders: Int = 0,
        activeModels: Int = 0
    ) {
        self.totalTokens = totalTokens
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cachedInputTokens = cachedInputTokens
        self.cacheHitRate = cacheHitRate
        self.totalCostUsd = totalCostUsd
        self.standardCostUsd = standardCostUsd
        self.premiumCostUsd = premiumCostUsd
        self.totalRuns = totalRuns
        self.activeProviders = activeProviders
        self.activeModels = activeModels
    }
}

public struct ModelUsage: Codable, Identifiable, Sendable {
    public var id: String { "\(provider)-\(model)" }
    public let model: String
    public let provider: String
    public let inputTokens: Int
    public let outputTokens: Int
    public let cachedInputTokens: Int
    public let cacheHitRate: Double
    public let costUsd: Double
    public let costPerMillionInput: Double
    public let costPerMillionOutput: Double
    public let runsCount: Int

    enum CodingKeys: String, CodingKey {
        case model, provider
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cachedInputTokens = "cached_input_tokens"
        case cacheHitRate = "cache_hit_rate"
        case costUsd = "cost_usd"
        case costPerMillionInput = "cost_per_million_input"
        case costPerMillionOutput = "cost_per_million_output"
        case runsCount = "runs_count"
    }

    public init(
        model: String,
        provider: String,
        inputTokens: Int,
        outputTokens: Int,
        cachedInputTokens: Int,
        cacheHitRate: Double,
        costUsd: Double,
        costPerMillionInput: Double,
        costPerMillionOutput: Double,
        runsCount: Int
    ) {
        self.model = model
        self.provider = provider
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cachedInputTokens = cachedInputTokens
        self.cacheHitRate = cacheHitRate
        self.costUsd = costUsd
        self.costPerMillionInput = costPerMillionInput
        self.costPerMillionOutput = costPerMillionOutput
        self.runsCount = runsCount
    }
}

public struct ProviderUsage: Codable, Identifiable, Sendable {
    public var id: String { provider }
    public let provider: String
    public let label: String
    public let inputTokens: Int
    public let outputTokens: Int
    public let cachedInputTokens: Int
    public let costUsd: Double
    public let runsCount: Int
    public let status: String

    enum CodingKeys: String, CodingKey {
        case provider, label, status
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cachedInputTokens = "cached_input_tokens"
        case costUsd = "cost_usd"
        case runsCount = "runs_count"
    }

    public init(
        provider: String,
        label: String,
        inputTokens: Int,
        outputTokens: Int,
        cachedInputTokens: Int,
        costUsd: Double,
        runsCount: Int,
        status: String
    ) {
        self.provider = provider
        self.label = label
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cachedInputTokens = cachedInputTokens
        self.costUsd = costUsd
        self.runsCount = runsCount
        self.status = status
    }
}

public struct DailyUsage: Codable, Identifiable, Sendable {
    public var id: String { date }
    public let date: String
    public let tokens: Int
    public let inputTokens: Int
    public let outputTokens: Int
    public let cachedInputTokens: Int
    public let costUsd: Double

    enum CodingKeys: String, CodingKey {
        case date, tokens
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cachedInputTokens = "cached_input_tokens"
        case costUsd = "cost_usd"
    }

    public init(
        date: String,
        tokens: Int,
        inputTokens: Int,
        outputTokens: Int,
        cachedInputTokens: Int,
        costUsd: Double
    ) {
        self.date = date
        self.tokens = tokens
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cachedInputTokens = cachedInputTokens
        self.costUsd = costUsd
    }
}

public struct ProviderLimit: Codable, Identifiable, Sendable {
    public var id: String { provider }
    public let provider: String
    public let label: String
    public let limitType: String
    public let used: Int
    public let limit: Int
    public let resetsIn: String
    public let pace: String
    public let status: String

    enum CodingKeys: String, CodingKey {
        case provider, label, pace, status
        case limitType = "limit_type"
        case used, limit
        case resetsIn = "resets_in"
    }

    public init(
        provider: String,
        label: String,
        limitType: String,
        used: Int,
        limit: Int,
        resetsIn: String,
        pace: String,
        status: String
    ) {
        self.provider = provider
        self.label = label
        self.limitType = limitType
        self.used = used
        self.limit = limit
        self.resetsIn = resetsIn
        self.pace = pace
        self.status = status
    }
}
