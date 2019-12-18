// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.LintError
import com.pinterest.ktlint.test.lint
import org.assertj.core.api.Assertions
import org.intellij.lang.annotations.Language
import org.junit.Test

class DialogModalityRuleTest {

    private val rule = DialogModalityRule()

    @Test
    fun runInEdtCallsShouldSpecifyModalityWhenCalledWithinDialog() {
        assertExpected(
                """
            class Blah : DialogWrapper {
              fun blah() {
                runInEdt { }
              }
            }
        """, 3 to 5
        )
    }

    @Test
    fun callsThatSpecifyModalityAnyAreFine() {
        assertExpected(
                """
            class Blah : DialogWrapper {
              fun blah() {
                runInEdt(ModalityState.any()) { }
              }
            }
        """)
    }

    @Test
    fun callsThatSpecifyWrongModalityAreNotFine() {
        assertExpected(
                """
            class Blah : DialogWrapper() {
              fun blah() {
                runInEdt(ModalityState.current()) { }
              }
            }
        """, 3 to 5
        )
    }

    private fun assertExpected(@Language("kotlin") kotlinText: String, vararg expectedErrors: Pair<Int, Int>) {
        Assertions.assertThat(rule.lint(kotlinText.trimIndent())).containsExactly(*expectedErrors.map {
            LintError(
                    it.first,
                    it.second,
                    rule.id,
                    "Call to runInEdt without ModalityState.any() within Dialog will not run until Dialog exits."
            )
        }.toTypedArray())
    }
}
