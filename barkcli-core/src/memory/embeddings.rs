use std::collections::HashMap;

use super::search::tokenize;

/// Sparse TF-IDF embedding for semantic search.
///
/// Instead of dense vector embeddings (which require heavy ML runtimes),
/// we use sparse TF-IDF vectors. These are:
/// - Fast to compute (no external dependencies)
/// - Small to store (only non-zero dimensions)
/// - Effective for short text matching
/// - Deterministic (same input → same output)
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Embedding {
    /// Sparse vector: dimension index → weight
    pub dimensions: HashMap<u32, f32>,
    /// Total number of dimensions (vocabulary size)
    pub dim_count: u32,
}

impl Embedding {
    /// Compute cosine similarity between two sparse embeddings.
    pub fn cosine_similarity(&self, other: &Embedding) -> f32 {
        if self.dimensions.is_empty() || other.dimensions.is_empty() {
            return 0.0;
        }

        // Dot product
        let mut dot = 0.0;
        for (dim, weight) in &self.dimensions {
            if let Some(other_weight) = other.dimensions.get(dim) {
                dot += weight * other_weight;
            }
        }

        if dot == 0.0 {
            return 0.0;
        }

        // Magnitudes
        let mag_a: f32 = self.dimensions.values().map(|w| w * w).sum::<f32>().sqrt();
        let mag_b: f32 = other.dimensions.values().map(|w| w * w).sum::<f32>().sqrt();

        if mag_a == 0.0 || mag_b == 0.0 {
            return 0.0;
        }

        dot / (mag_a * mag_b)
    }

    /// Compute L2 norm of the embedding.
    pub fn norm(&self) -> f32 {
        self.dimensions.values().map(|w| w * w).sum::<f32>().sqrt()
    }
}

/// TF-IDF embedding engine.
///
/// Builds a vocabulary from a corpus and computes sparse TF-IDF vectors
/// for any text. The vocabulary maps tokens to dimension indices.
pub struct EmbeddingEngine {
    /// Token → dimension index
    vocab: HashMap<String, u32>,
    /// Document frequency for each token (how many docs contain it)
    doc_freq: HashMap<String, u32>,
    /// Total documents seen
    total_docs: u32,
}

impl EmbeddingEngine {
    pub fn new() -> Self {
        Self {
            vocab: HashMap::new(),
            doc_freq: HashMap::new(),
            total_docs: 0,
        }
    }

    /// Build vocabulary from a corpus of texts.
    pub fn build_vocabulary(&mut self, texts: &[&str]) {
        self.total_docs = texts.len() as u32;

        // First pass: collect all unique tokens and document frequencies
        let mut doc_tokens: Vec<HashMap<String, usize>> = Vec::new();

        for text in texts {
            let tokens = tokenize(text);
            let mut term_freq: HashMap<String, usize> = HashMap::new();
            for token in &tokens {
                *term_freq.entry(token.clone()).or_insert(0) += 1;
            }
            doc_tokens.push(term_freq);
        }

        // Compute document frequency
        for term_freq in &doc_tokens {
            for token in term_freq.keys() {
                *self.doc_freq.entry(token.clone()).or_insert(0) += 1;
            }
        }

        // Assign dimension indices to tokens (sorted for determinism)
        let mut sorted_tokens: Vec<String> = self.doc_freq.keys().cloned().collect();
        sorted_tokens.sort();
        for (idx, token) in sorted_tokens.into_iter().enumerate() {
            self.vocab.insert(token, idx as u32);
        }
    }

    /// Compute TF-IDF embedding for a text.
    pub fn embed(&self, text: &str) -> Embedding {
        let tokens = tokenize(text);
        if tokens.is_empty() {
            return Embedding::default();
        }

        // Term frequency
        let mut tf: HashMap<String, usize> = HashMap::new();
        for token in &tokens {
            *tf.entry(token.clone()).or_insert(0) += 1;
        }

        let doc_len = tokens.len() as f32;
        let mut dimensions = HashMap::new();

        for (token, &count) in &tf {
            if let Some(&dim) = self.vocab.get(token) {
                // TF: normalized term frequency
                let tf_val = count as f32 / doc_len;

                // IDF: log(N / df) with smoothing
                let df = self.doc_freq.get(token).copied().unwrap_or(0) as f32;
                let idf = if df > 0.0 {
                    ((self.total_docs as f32) / df).ln() + 1.0
                } else {
                    1.0
                };

                let tfidf = tf_val * idf;
                if tfidf > 0.0 {
                    dimensions.insert(dim, tfidf);
                }
            }
        }

        Embedding {
            dimensions,
            dim_count: self.vocab.len() as u32,
        }
    }

    /// Get vocabulary size.
    pub fn vocab_size(&self) -> usize {
        self.vocab.len()
    }

    /// Check if vocabulary is built.
    pub fn is_ready(&self) -> bool {
        !self.vocab.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_cosine_similarity() {
        let mut engine = EmbeddingEngine::new();
        let texts = vec![
            "Rust is a systems programming language",
            "Python is a scripting language",
            "JavaScript runs in the browser",
            "Rust provides memory safety",
        ];
        engine.build_vocabulary(&texts);

        // "Rust programming language" and "Rust provides safety" share "rust"
        let emb1 = engine.embed("Rust programming language");
        let emb2 = engine.embed("Rust provides safety");
        // "Python scripting language" shares "language" with the Rust texts
        let emb3 = engine.embed("Python scripting language");
        let emb4 = engine.embed("completely unrelated quantum physics");

        let sim_1_2 = emb1.cosine_similarity(&emb2);
        let sim_1_4 = emb1.cosine_similarity(&emb4);

        // Same domain → some similarity
        assert!(sim_1_2 > 0.0, "sim_1_2 = {}", sim_1_2);
        // Unrelated → less similar
        assert!(sim_1_4 < sim_1_2, "sim_1_4={} >= sim_1_2={}", sim_1_4, sim_1_2);
    }

    #[test]
    fn test_embedding_empty() {
        let engine = EmbeddingEngine::new();
        let emb = engine.embed("");
        assert!(emb.dimensions.is_empty());
    }

    #[test]
    fn test_embedding_deterministic() {
        let mut engine = EmbeddingEngine::new();
        engine.build_vocabulary(&["hello world", "foo bar"]);

        let emb1 = engine.embed("hello world");
        let emb2 = engine.embed("hello world");
        assert_eq!(emb1.dimensions, emb2.dimensions);
    }

    #[test]
    fn test_vocabulary_building() {
        let mut engine = EmbeddingEngine::new();
        assert!(!engine.is_ready());

        engine.build_vocabulary(&["hello world", "foo bar baz"]);
        assert!(engine.is_ready());
        assert!(engine.vocab_size() > 0);
    }
}
