// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.aws.toolkits.jetbrains.services.clouddebug.java.JvmDebuggerSupport
import software.aws.toolkits.resources.message

class JavaStartCommandAugmenterTest {
    private val augmenter = JvmDebuggerSupport()
    private val basicRun = "java -jar x.jar"

    @Test
    fun augmenterAddsEnivronmentVariable() {
        assertThat(augmenter.augmentStatement(basicRun, listOf(123), "")).contains("${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=123", "")
    }

    @Test
    fun augmenterAddsPort() {
        val augmentedStatement = augmenter.augmentStatement(basicRun, listOf(123), "")
        assertThat(augmentedStatement).contains("address=123").contains("-agentlib:jdwp")
    }

    @Test
    fun augmenterEmptyPortsArray() {
        assertThatThrownBy { augmenter.augmentStatement(basicRun, listOf(), "") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("cloud_debug.step.augment_statement.missing_debug_port"))
    }

    @Test
    fun singleQuotesThrows() {
        val statement = "'/whatever/java' -jar abc.jar"
        assertThatThrownBy { augmenter.automaticallyAugmentable(statement) }.isInstanceOf(RuntimeConfigurationException::class.java)
    }

    @Test
    fun augmenterDoesNotAddAdditionalDebugger() {
        val augmentedStatement = augmenter.augmentStatement(basicRun, listOf(123), "")
        assertThat(augmentedStatement).contains("java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=123 -jar x.jar")
    }

    @Test
    fun augmenterDetectsAlreadyAugmentable() {
        assertThat(augmenter.automaticallyAugmentable(basicRun)).isTrue()
    }

    @Test
    fun badlyConfiguredStartThrows() {
        var statement = "java -Xdebug -Xrunjdwp:transport=dt_socket,server=y,address=123 -jar x.jar"
        assertThatThrownBy { augmenter.automaticallyAugmentable(statement) }.isInstanceOf(RuntimeConfigurationException::class.java)
        statement = "java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=1234 -jar x.jar"
        assertThatThrownBy { augmenter.automaticallyAugmentable(statement) }.isInstanceOf(RuntimeConfigurationException::class.java)
    }

    @Test
    fun augmentableWorksForPaths() {
        var statement = "/abc/java -jar abc.jar"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
        statement = "\"/abc/ bla/java\" -jar abc.jar"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
    }

    @Test
    fun augmenterWorksForPaths() {
        var statement = "/abc/java -jar abc.jar"
        assertThat(augmenter.augmentStatement(statement, listOf(123), "")).contains("/abc/java -agentlib:jdwp")
        statement = "\"/abc/ bla/java\" -jar abc.jar"
        assertThat(augmenter.augmentStatement(statement, listOf(123), "")).contains("\"/abc/ bla/java\" -agentlib:jdwp")
    }

    @Test
    fun doesNotAugmentBadInput() {
        var statement = "/whatever/Notjava -jar abc.jar"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "\"/whatever/notjava\" -jar abc.jar"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "startjava.sh some input"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "java"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
    }
}
