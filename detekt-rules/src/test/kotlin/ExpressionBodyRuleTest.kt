// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.gradle.detekt.rules.ExpressionBodyRule

class ExpressionBodyRuleTest {

    private val rule = ExpressionBodyRule()

    @Test
    fun singleLineStatementsShouldBeMarkedAsExpressionBody() {
        val code = """
            private fun hello(): String {
                return "hello"
            }
        """.trimIndent()
        assertThat(rule.lint(code)).hasOnlyOneElementSatisfying {
            it.id == "ExpressionBody" && it.message == "Use expression body instead of one line return"
        }
    }

    @Test
    fun complexStatementsStillAreMarked() {
        val code = """
            fun hello(): List<String> {
                return blah().map { it.displayName() }
            }
        """.trimIndent()
        assertThat(rule.lint(code)).hasOnlyOneElementSatisfying {
            it.id == "ExpressionBody" && it.message == "Use expression body instead of one line return"
        }
    }

    @Test
    fun nonReturningMethod() {
        val code = """
            fun nonReturningMethod() {
                blah()
            }
        """.trimIndent()
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun multiLineReturningMethod() {
        val code = """
            fun multiLineReturningMethod(): String {
                val blah = blah()
                return blah
            }
        """.trimIndent()
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun ifStatementsDontCount() {
        val code = """
            fun ifStatementsDontCount(): String {
                if (blah) return ""
                return blah
            }
        """.trimIndent()
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun elvisOperator() {
        val code = """
            fun elvisOperator(): String? {
                blah ?: return null
                return ""
            }
        """.trimIndent()
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun elvisOperatorNonReturn() {
        val code = """
            fun elvisOperatorNonReturn() {
                blah ?: return
                blah2()
            }
        """.trimIndent()
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun commentsAreIgnored() {
        val code = """
            fun commentsAreIgnored(): String {
              //returning something
              return blah()
            }
        """.trimIndent()
        assertThat(rule.lint(code))
            .hasOnlyOneElementSatisfying {
                it.id == "ExpressionBody" && it.message == "Use expression body instead of one line return"
            }
    }

    @Test
    fun emptyBlockIsIgnored() {
        val code = "fun blah() {}"
        assertThat(rule.lint(code)).isEmpty()
    }

    @Test
    fun expressionStatementsAreIgnored() {
        val code = "fun blah() = \"hello\""
        assertThat(rule.lint(code)).isEmpty()
    }
}

