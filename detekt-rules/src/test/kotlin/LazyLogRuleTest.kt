// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.gradle.detekt.rules.LazyLogRule

class LazyLogRuleTest {
    private val rule = LazyLogRule()

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
        ).hasOnlyOneElementSatisfying {
            it.id == "LazyLog" && it.message == "Use the Lambda version of LOG.debug instead"
        }
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

    @Test
    fun methodCallIsUsedToLogInUiTests() {
        assertThat(
            rule.lint(
                """
package software.aws.toolkits.jetbrains.uitests.really.cool.test

import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger(T::class.java)
fun foo() {
    LOG.debug("Hi")
}
                """.trimIndent()
            )
        ).isEmpty()
    }
}
