// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationException
import org.assertj.core.api.Assertions
import org.junit.Test
import software.aws.toolkits.jetbrains.services.clouddebug.java.JvmDebuggerSupport

class JavaStartCommandAugmenterTest {
    private val augmenter = JvmDebuggerSupport()

    @Test
    fun augmenterAddsEnivronmentVariable() {
        Assertions.assertThat(augmenter.augmentStatement("java -jar x.jar", listOf(123), "")).contains("${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=123", "")
    }

    @Test
    fun augmenterAddsPort() {
        val augmentedStatement = augmenter.augmentStatement("java -jar x.jar", listOf(123), "")
        Assertions.assertThat(augmentedStatement).contains("address=123").contains("-agentlib:jdwp")
    }

    @Test
    fun singleQuotesThrows() {
        val statement = "'/whatever/java' -jar abc.jar"
        Assertions.assertThatThrownBy { augmenter.automaticallyAugmentable(statement) }.isInstanceOf(RuntimeConfigurationException::class.java)
    }

    @Test
    fun augmenterDoesNotAddAdditionalDebugger() {
        val augmentedStatement = augmenter.augmentStatement("java -jar x.jar", listOf(123), "")
        Assertions.assertThat(augmentedStatement).contains("java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=123 -jar x.jar")
    }

    @Test
    fun augmenterDetectsAlreadyAugmentable() {
        val statement = "java -jar x.jar"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
    }

    @Test
    fun badlyConfiguredStartThrows() {
        var statement = "java -Xdebug -Xrunjdwp:transport=dt_socket,server=y,address=123 -jar x.jar"
        Assertions.assertThatThrownBy { augmenter.automaticallyAugmentable(statement) }.isInstanceOf(RuntimeConfigurationException::class.java)
        statement = "java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=1234 -jar x.jar"
        Assertions.assertThatThrownBy { augmenter.automaticallyAugmentable(statement) }.isInstanceOf(RuntimeConfigurationException::class.java)
    }

    @Test
    fun augmentableWorksForPaths() {
        var statement = "/abc/java -jar abc.jar"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
        statement = "\"/abc/ bla/java\" -jar abc.jar"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
    }

    @Test
    fun augmenterWorksForPaths() {
        var statement = "/abc/java -jar abc.jar"
        Assertions.assertThat(augmenter.augmentStatement(statement, listOf(123), "")).contains("/abc/java -agentlib:jdwp")
        statement = "\"/abc/ bla/java\" -jar abc.jar"
        Assertions.assertThat(augmenter.augmentStatement(statement, listOf(123), "")).contains("\"/abc/ bla/java\" -agentlib:jdwp")
    }

    @Test
    fun doesNotAugmentBadInput() {
        var statement = "/whatever/Notjava -jar abc.jar"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "\"/whatever/notjava\" -jar abc.jar"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "startjava.sh some input"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "java"
        Assertions.assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
    }
}
