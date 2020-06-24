// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.LintError
import com.pinterest.ktlint.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class BannedImportsRuleTest {
    private val rule = BannedImportsRule()

    @Test
    fun `Importing Assert fails`() {
        assertThat(rule.lint("import org.assertj.core.api.Assertions"))
            .containsExactly(
                LintError(
                    1,
                    1,
                    "banned-imports",
                    "Import the assertion you want to use directly instead of importing the top level Assertions"
                )
            )
    }

    @Test
    fun `Importing Hamcrest fails`() {
        assertThat(rule.lint("import org.hamcrest.AnyClass"))
            .containsExactly(
                LintError(
                    1,
                    1,
                    "banned-imports",
                    "Use AssertJ instead of Hamcrest assertions"
                )
            )
    }

    @Test
    fun `Importing Assert assertThat succeeds`() {
        assertThat(rule.lint("import org.assertj.core.api.Assertions.assertThat")).isEmpty()
    }
}
