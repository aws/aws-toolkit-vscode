// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.github.shyiko.ktlint.core.LintError
import com.github.shyiko.ktlint.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class LogLambdaRuleTest {
    private val rule = LogLambdaRule()

    @Test
    fun lambdaIsUsedToLog() {
        assertThat(
            rule.lint(
                """
import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger(T::class.java)
fun foo() {
    LOG.debug {"Hi" }
}
        """.trimIndent()
            )
        ).isEmpty()
    }

    @Test
    fun methodCallIsUsedToLog() {
        assertThat(
            rule.lint(
                """
import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger(T::class.java)
fun foo() {
    LOG.debug("Hi")
}
        """.trimIndent()
            )
        ).containsExactly(LintError(5, 9, "log-not-lazy", "Use the Lambda version of LOG.debug instead"))
    }

    @Test
    fun lambdaIsUsedToLogButWithException() {
        assertThat(
            rule.lint(
                """
import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger(T::class.java)
fun foo() {
    val e = RuntimeException()
    LOG.debug(e) {"Hi" }
}
        """.trimIndent()
            )
        ).isEmpty()
    }
}