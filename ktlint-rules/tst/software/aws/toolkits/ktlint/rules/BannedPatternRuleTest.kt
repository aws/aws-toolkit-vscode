// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.LintError
import com.pinterest.ktlint.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class BannedPatternRuleTest {
    private val rule = BannedPatternRule(listOf(BannedPattern("""blah\(\)""".toRegex(), "Use of method blah() is banned.")))

    @Test
    fun classContainingRegexCreatesError() {
        assertThat(
            rule.lint(
                """
            fun hello() {
                blah()
            }
        """.trimIndent()
            )
        ).containsExactly(LintError(1, 1, "banned-pattern", "[2:5] Use of method blah() is banned."))
    }
}
