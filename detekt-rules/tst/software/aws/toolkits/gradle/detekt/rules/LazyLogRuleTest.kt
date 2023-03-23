// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.github.detekt.test.utils.createEnvironment
import io.gitlab.arturbosch.detekt.test.compileAndLintWithContext
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import java.io.File

class LazyLogRuleTest {
    private val rule = LazyLogRule()
    private val environment = createEnvironment(
        additionalRootPaths = LazyLogRule.loggers.map {
            File(Class.forName(it).protectionDomain.codeSource.location.path)
        }
    ).env

    @Test
    fun lambdaIsUsedToLog() {
        assertThat(
            rule.compileAndLintWithContext(
                environment,
                """
import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger("")
fun foo() {
    LOG.debug { "Hi" }
}
                """.trimIndent()
            )
        ).isEmpty()
    }

    @Test
    fun methodCallIsUsedToLog() {
        assertThat(
            rule.compileAndLintWithContext(
                environment,
                """
import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger("")
fun foo() {
    LOG.debug("Hi")
}
                """.trimIndent()
            )
        ).singleElement()
            .matches {
                it.id == "LazyLog" && it.message == "Use the lambda version of LOG.debug instead"
            }
    }

    @Test
    fun lambdaIsUsedToLogButWithException() {
        assertThat(
            rule.compileAndLintWithContext(
                environment,
                """
import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger("")
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
            rule.compileAndLintWithContext(
                environment,
                """
package software.aws.toolkits.jetbrains.uitests.really.cool.test

import org.slf4j.LoggerFactory

val LOG = LoggerFactory.getLogger("")
fun foo() {
    LOG.debug("Hi")
}
                """.trimIndent()
            )
        ).isEmpty()
    }
}
