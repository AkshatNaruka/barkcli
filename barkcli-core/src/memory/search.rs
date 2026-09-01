use std::collections::HashMap;

use super::store::MemoryEntry;

/// Search memories using BM25 scoring.
///
/// BM25 is a probabilistic retrieval function that scores documents based on
/// term frequency and inverse document frequency. It's fast, lightweight,
/// and works well for short text entries.
pub fn search_memories<'a>(entries: &'a [MemoryEntry], query: &str, top: usize) -> Vec<&'a MemoryEntry> {
    if query.is_empty() || entries.is_empty() {
        return Vec::new();
    }

    let query_tokens = tokenize(query);
    if query_tokens.is_empty() {
        return Vec::new();
    }

    let avg_dl = average_document_length(entries);
    let idf = compute_idf(entries, &query_tokens);

    let mut scored: Vec<(&MemoryEntry, f32)> = entries
        .iter()
        .map(|entry| {
            let tokens = tokenize(&entry.content);
            let score = bm25_score(&tokens, &query_tokens, &idf, avg_dl);
            (entry, score)
        })
        .filter(|(_, score)| *score > 0.0)
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(top).map(|(e, _)| e).collect()
}

/// BM25 scoring function.
fn bm25_score(
    doc_tokens: &[String],
    query_tokens: &[String],
    idf: &HashMap<String, f32>,
    avg_dl: f32,
) -> f32 {
    let k1 = 1.2;
    let b = 0.75;
    let doc_len = doc_tokens.len() as f32;

    // Term frequency for this document
    let mut tf: HashMap<String, usize> = HashMap::new();
    for token in doc_tokens {
        *tf.entry(token.clone()).or_insert(0) += 1;
    }

    let mut score = 0.0;
    for qt in query_tokens {
        if let Some(&tf_val) = tf.get(qt) {
            let idf_val = idf.get(qt).copied().unwrap_or(0.0);
            let numerator = tf_val as f32 * (k1 + 1.0);
            let denominator = tf_val as f32 + k1 * (1.0 - b + b * doc_len / avg_dl);
            score += idf_val * numerator / denominator;
        }
    }

    score
}

/// Compute IDF (inverse document frequency) for query tokens.
fn compute_idf(entries: &[MemoryEntry], query_tokens: &[String]) -> HashMap<String, f32> {
    let n = entries.len() as f32;
    let mut idf = HashMap::new();

    for qt in query_tokens {
        let doc_count = entries
            .iter()
            .filter(|e| tokenize(&e.content).contains(qt))
            .count() as f32;

        // BM25 IDF with floor to avoid negative values
        let idf_val = ((n - doc_count + 0.5) / (doc_count + 0.5) + 1.0).max(0.01);
        idf.insert(qt.clone(), idf_val);
    }

    idf
}

/// Average document length across all entries.
fn average_document_length(entries: &[MemoryEntry]) -> f32 {
    if entries.is_empty() {
        return 0.0;
    }
    let total: usize = entries.iter().map(|e| tokenize(&e.content).len()).sum();
    total as f32 / entries.len() as f32
}

/// Tokenize text into lowercase words.
///
/// Splits on whitespace and punctuation, filters out short tokens.
pub fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|s| s.len() > 1)
        .map(|s| s.to_string())
        .collect()
}

/// Compute cosine similarity between two token vectors.
pub fn cosine_similarity(a: &[String], b: &[String]) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    let mut freq_a: HashMap<&str, usize> = HashMap::new();
    for t in a {
        *freq_a.entry(t).or_insert(0) += 1;
    }

    let mut freq_b: HashMap<&str, usize> = HashMap::new();
    for t in b {
        *freq_b.entry(t).or_insert(0) += 1;
    }

    // Dot product
    let mut dot = 0.0;
    for (term, &count_a) in &freq_a {
        if let Some(&count_b) = freq_b.get(term) {
            dot += count_a as f32 * count_b as f32;
        }
    }

    if dot == 0.0 {
        return 0.0;
    }

    // Magnitudes
    let mag_a: f32 = freq_a.values().map(|&c| c as f32 * c as f32).sum::<f32>().sqrt();
    let mag_b: f32 = freq_b.values().map(|&c| c as f32 * c as f32).sum::<f32>().sqrt();

    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }

    dot / (mag_a * mag_b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::store::MemoryTier;

    fn make_entry(content: &str) -> MemoryEntry {
        MemoryEntry::new(content, MemoryTier::LongTerm)
    }

    #[test]
    fn test_tokenize() {
        let tokens = tokenize("Hello, World! This is a test.");
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
        assert!(tokens.contains(&"test".to_string()));
        // Single chars filtered out
        assert!(!tokens.contains(&"a".to_string()));
    }

    #[test]
    fn test_bm25_basic() {
        let entries = vec![
            make_entry("Rust is a systems programming language"),
            make_entry("Python is a scripting language"),
            make_entry("JavaScript runs in the browser"),
        ];

        let results = search_memories(&entries, "Rust programming", 2);
        assert!(!results.is_empty());
        // First result should be about Rust
        assert!(results[0].content.contains("Rust"));
    }

    #[test]
    fn test_bm25_no_match() {
        let entries = vec![
            make_entry("Rust is a systems language"),
            make_entry("Python is a scripting language"),
        ];

        let results = search_memories(&entries, "quantum computing", 5);
        assert!(results.is_empty());
    }

    #[test]
    fn test_bm25_empty() {
        let results = search_memories(&[], "test", 5);
        assert!(results.is_empty());
    }

    #[test]
    fn test_cosine_similarity() {
        let a = tokenize("hello world foo");
        let b = tokenize("hello world bar");
        let sim = cosine_similarity(&a, &b);
        assert!(sim > 0.5); // High similarity (2/3 overlap)
    }

    #[test]
    fn test_cosine_no_overlap() {
        let a = tokenize("hello world");
        let b = tokenize("foo bar baz");
        let sim = cosine_similarity(&a, &b);
        assert_eq!(sim, 0.0);
    }
}
