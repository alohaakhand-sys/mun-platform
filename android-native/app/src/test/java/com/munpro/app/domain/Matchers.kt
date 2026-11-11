package com.munpro.app.domain

import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse

// The two vitest matchers the ported suites lean on that JUnit 4 has no direct equivalent for.

/** vitest `expect(actual).toMatch(/pattern/i)`. */
fun assertMatches(pattern: String, actual: String?) {
    assertTrue("expected <$actual> to match /$pattern/i", actual != null && Regex(pattern, RegexOption.IGNORE_CASE).containsMatchIn(actual))
}

/** vitest `expect(actual).not.toMatch(/pattern/i)`. */
fun assertNotMatches(pattern: String, actual: String?) {
    assertFalse("expected <$actual> not to match /$pattern/i", actual != null && Regex(pattern, RegexOption.IGNORE_CASE).containsMatchIn(actual))
}
