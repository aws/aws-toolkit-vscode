// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import org.assertj.core.api.Assertions
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.clouddebug.python.PythonDebuggerSupport
import software.aws.toolkits.resources.message

class PythonStartCommandAugmenterTest {
    private val augmenter = PythonDebuggerSupport()

    @Test
    fun doesNotAugmentBadInput() {
        var statement = "python3.7.sh abc"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "python.sh abc"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "python! abc"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "java -jar python"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "python3.7"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "python. abc"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "python2. abc"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "/abc/notpython2 abc"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
        statement = "\"/abc/notpython2.7\" python23"
        assertThat(augmenter.automaticallyAugmentable(statement)).isFalse()
    }

    @Test
    fun augmenterDetectsAutomaticallyAugmentable() {
        var statement = "python3.7 test.py"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
        statement = "python test.py"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
        statement = "python2 test.py"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
    }

    @Test
    fun augmenterDoesNotCloberStartCommand() {
        var augmentedStatement = augmenter.augmentStatement("python3 test.py", listOf(123), "")
        assertThat(augmentedStatement).contains("python3")
        augmentedStatement = augmenter.augmentStatement("python3.7 test.py", listOf(123), "")
        assertThat(augmentedStatement).contains("python3.7")
    }

    @Test
    fun augmenterAddsPortAndPydevd() {
        val augmentedStatement = augmenter.augmentStatement("python3 test.py", listOf(123), "/abc/pydevd.py")
        assertThat(augmentedStatement).contains("--port 123").contains("/abc/pydevd.py")
    }

    @Test
    fun augmenterEmptyPortsArray() {
        Assertions.assertThatThrownBy { augmenter.augmentStatement("python3 test.py", listOf(), "/abc/pydevd.py") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("cloud_debug.step.augment_statement.missing_debug_port"))
    }

    @Test
    fun augmenterWorksForPaths() {
        assertThat(augmenter.augmentStatement("/abc/python3 test.py", listOf(123), "/abc/pydevd.py")).contains("/abc/python3 -u /abc/pydevd.py ")
        assertThat(
            augmenter.augmentStatement(
                "\"/abc/ bla/python2\" test.py",
                listOf(123),
                "/abc/pydevd.py"
            )
        ).contains("\"/abc/ bla/python2\" -u /abc/pydevd.py ")
    }

    @Test
    fun augmentableWorksForPaths() {
        var statement = "/abc/python2.6 test.py"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
        statement = "\"/abc/ bla/python2\" test.py"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
        statement = "/abc/bla/python3 test.py"
        assertThat(augmenter.automaticallyAugmentable(statement)).isTrue()
    }
}
