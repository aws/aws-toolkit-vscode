// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class DialogModalityRuleTest {
    private val rule = DialogModalityRule()

    @Test
    fun runInEdtCallsShouldSpecifyModalityWhenCalledWithinDialog() {
        val code = """
            class Blah : DialogWrapper {
              fun blah() {
                runInEdt { }
              }
            }
        """
        assertThat(rule.lint(code)).singleElement()
            .matches {
                it.id == "RunInEdtWithoutModalityInDialog" &&
                    it.message == "Call to runInEdt without ModalityState.any() within Dialog will not run until Dialog exits."
            }
    }

    @Test
    fun callsThatSpecifyModalityAnyAreFine() {
        val code = """
            class Blah : DialogWrapper {
              fun blah() {
                runInEdt(ModalityState.any()) { }
              }
            }
        """.trimIndent()
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun callsThatSpecifyWrongModalityAreNotFine() {
        val code = """
            class Blah : DialogWrapper() {
              fun blah() {
                runInEdt(ModalityState.current()) { }
              }
            }
        """

        assertThat(rule.lint(code)).singleElement()
            .matches {
                it.id == "RunInEdtWithoutModalityInDialog" &&
                    it.message == "Call to runInEdt without ModalityState.any() within Dialog will not run until Dialog exits."
            }
    }
}
