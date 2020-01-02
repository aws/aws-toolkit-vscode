// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.LintError
import com.pinterest.ktlint.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class CopyrightHeaderRuleTest {
    private val rule = CopyrightHeaderRule()

    @Test
    fun noHeaderPresent() {
        assertThat(
            rule.lint(
                """
        import a.b.c
        """.trimIndent()
            )
        ).containsExactly(
            LintError(1, 1, "copyright-header", "Missing or incorrect file header")
        )
    }

    @Test
    fun headerPresent() {
        assertThat(
            rule.lint(
                """
        // Copyright 1970 Amazon.com, Inc. or its affiliates. All Rights Reserved.
        // SPDX-License-Identifier: Apache-2.0

        import a.b.c
        """.trimIndent()
            )
        ).isEmpty()
    }
}
