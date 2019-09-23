// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.LintError
import com.pinterest.ktlint.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.intellij.lang.annotations.Language
import org.junit.Test

class ExpressionBodyRuleTest {

    private val rule = ExpressionBodyRule()

    @Test
    fun singleLineStatementsShouldBeMarkedAsExpressionBody() {
        assertExpected(
            """
            private fun hello(): String {
                return "hello"
            }
        """, 1 to 1
        )
    }

    @Test
    fun complexStatementsStillAreMarked() {
        assertExpected(
            """
            fun hello(): List<String> {
                return blah().map { it.displayName() }
            }
        """, 1 to 1
        )
    }

    @Test
    fun nonReturningMethod() {

        assertExpected(
            """
            fun nonReturningMethod() {
                blah()
            }
        """
        )
    }

    @Test
    fun multiLineReturningMethod() {
        assertExpected(
            """
            fun multiLineReturningMethod(): String {
                val blah = blah()
                return blah
            }
        """
        )
    }

    @Test
    fun ifStatementsDontCount() {
        assertExpected(
            """
            fun ifStatementsDontCount(): String {
                if (blah) return ""
                return blah
            }
        """
        )
    }

    @Test
    fun elvisOperator() {
        assertExpected(
            """
            fun elvisOperator(): String? {
                blah ?: return null
                return ""
            }
        """
        )
    }

    @Test
    fun elvisOperatorNonReturn() {
        assertExpected(
            """
            fun elvisOperatorNonReturn() {
                blah ?: return
                blah2()
            }
        """
        )
    }

    @Test
    fun commentsAreIgnored() {
        assertExpected(
            """
            fun commentsAreIgnored(): String {
              //returning something
              return blah()
            }
        """, 1 to 1)
    }

    @Test
    fun emptyBlockIsIgnored() {
        assertExpected("fun blah() {}")
    }

    @Test
    fun expressionStatementsAreIgnored() {
        assertExpected("fun blah() = \"hello\"")
    }

    private fun assertExpected(@Language("kotlin") kotlinText: String, vararg expectedErrors: Pair<Int, Int>) {
        assertThat(rule.lint(kotlinText.trimIndent())).containsExactly(*expectedErrors.map {
            LintError(
                it.first,
                it.second,
                "expression-body",
                "Use expression body instead of one line return"
            )
        }.toTypedArray())
    }
}
