pub fn to_slug(text: &str) -> String {
    let slug: String = text
        .chars()
        .map(|c| match c {
            c if c.is_ascii_alphanumeric() => c.to_ascii_lowercase(),
            c if c.is_ascii_whitespace() || c == '-' || c == '_' => '-',
            _ => '-',
        })
        .collect();

    let slug: String = slug
        .chars()
        .fold(String::new(), |mut acc, c| {
            if c == '-' && acc.ends_with('-') {
                // skip duplicate hyphens
            } else {
                acc.push(c);
            }
            acc
        });

    slug.trim_matches('-').to_string()
}

pub fn unique_slug(text: &str, existing_ids: &[String]) -> String {
    let base = to_slug(text);
    if base.is_empty() {
        return "untitled".into();
    }
    if !existing_ids.contains(&base) {
        return base;
    }
    let mut counter = 2;
    loop {
        let candidate = format!("{}-{}", base, counter);
        if !existing_ids.contains(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_slug() {
        assert_eq!(to_slug("Hello World"), "hello-world");
        assert_eq!(to_slug("Add JWT Login"), "add-jwt-login");
        assert_eq!(to_slug("  spaces  "), "spaces");
        assert_eq!(to_slug("UPPER_CASE"), "upper-case");
    }

    #[test]
    fn test_unique_slug() {
        let existing = vec!["hello-world".into()];
        assert_eq!(unique_slug("Hello World", &existing), "hello-world-2");
        assert_eq!(unique_slug("New Thing", &existing), "new-thing");
    }
}
