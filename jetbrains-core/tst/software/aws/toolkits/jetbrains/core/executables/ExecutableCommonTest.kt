// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.util.text.SemVer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test

class ExecutableCommonTest {

    @Test
    fun gettingCommandLineWhenExecutableIsFoundWorksAndModificationsAreApplied() {
        val path = "/foo/bar"
        val name = "Testing 1-2-3"
        val commandLine = ExecutableCommon.getCommandLine(path, name)
        assertThat(commandLine.exePath).isEqualTo(path)
        assertThat(commandLine.environment.containsKey("AWS_ACCESS_KEY_ID")).isFalse()
        assertThat(commandLine.environment.containsKey("AWS_SECRET_ACCESS_KEY")).isFalse()
        assertThat(commandLine.environment.containsKey("AWS_SESSION_TOKEN")).isFalse()
        assertThat(commandLine.parentEnvironmentType).isEqualTo(GeneralCommandLine.ParentEnvironmentType.NONE)
    }

    @Test
    fun checkSemVerVersionThrowsIfOver() {
        val curr = SemVer("10.0.0", 10, 0, 0)
        val min = SemVer("0.0.1", 0, 0, 1)
        val max = SemVer("9.9.9", 9, 9, 9)
        val name = "high and outside"
        assertThatThrownBy { ExecutableCommon.checkSemVerVersion(curr, min, max, name) }
            .isInstanceOf(RuntimeException::class.java)
    }

    @Test
    fun checkSemVerVersionThrowsIfUnder() {
        val curr = SemVer("1.0.0", 10, 0, 0)
        val min = SemVer("1.0.1", 1, 0, 1)
        val max = SemVer("9.9.9", 9, 9, 9)
        val name = "you must be this tall to ride"
        assertThatThrownBy { ExecutableCommon.checkSemVerVersion(curr, min, max, name) }
            .isInstanceOf(RuntimeException::class.java).hasMessageContaining(name)
    }
}
