// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.testFramework.ProjectRule
import com.intellij.util.text.SemVer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.telemetry.ClientMetadata

class ExecutableCommonTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun gettingCommandLineWhenExecutableIsFoundWorksAndModificationsAreApplied() {
        val path = "/foo/bar"
        val name = "Testing 1-2-3"
        val commandLine = ExecutableCommon.getCommandLine(path, name)
        assertThat(commandLine.exePath).isEqualTo(path)
        assertThat(commandLine.environment.containsKey("AWS_ACCESS_KEY_ID")).isFalse
        assertThat(commandLine.environment.containsKey("AWS_SECRET_ACCESS_KEY")).isFalse
        assertThat(commandLine.environment.containsKey("AWS_SESSION_TOKEN")).isFalse
        assertThat(commandLine.environment.containsKey("AWS_TOOLING_USER_AGENT")).isFalse
        assertThat(commandLine.parentEnvironmentType).isEqualTo(GeneralCommandLine.ParentEnvironmentType.NONE)
    }

    @Test
    fun gettingCommandLineWhenExecutableIsSamExecutable() {
        val path = "/foo/bar"
        val name = "sam.cmd"
        val clientMetadata = ClientMetadata(
            productName = AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS,
            productVersion = "1.0",
            clientId = "foo",
            parentProduct = "JetBrains",
            parentProductVersion = "191",
            os = "mac",
            osVersion = "1.0"
        )
        val commandLine = ExecutableCommon.getCommandLine(path, name, SamExecutable(), clientMetadata)
        assertThat(commandLine.exePath).isEqualTo(path)
        assertThat(commandLine.environment.containsKey("AWS_TOOLING_USER_AGENT")).isTrue
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

    @Test
    fun checkSemVerVersionForParallelValidVersionsThrowsIfUnder() {
        val curr = SemVer("1.0.0", 1, 0, 0)
        val min1 = SemVer("1.0.1", 1, 0, 1)
        val max1 = SemVer("3.0.0", 3, 0, 0)
        val min2 = SemVer("4.0.1", 4, 0, 1)
        val max2 = SemVer("9.9.9", 9, 9, 9)
        val name = "Lower than minimum"
        assertThatThrownBy {
            ExecutableCommon.checkSemVerVersionForParallelValidVersions(
                curr,
                listOf(
                    ExecutableVersionRange(min1, max1),
                    ExecutableVersionRange(min2, max2)
                ),
                name
            )
        }.isInstanceOf(RuntimeException::class.java)
    }

    @Test
    fun checkSemVerVersionForParallelValidVersionsThrowsIfOver() {
        val curr = SemVer("9.0.0", 9, 0, 0)
        val min1 = SemVer("1.0.1", 1, 0, 1)
        val max1 = SemVer("3.0.0", 3, 0, 0)
        val min2 = SemVer("4.0.1", 4, 0, 1)
        val max2 = SemVer("8.8.8", 8, 8, 8)
        val name = "Higher than maximum"
        assertThatThrownBy {
            ExecutableCommon.checkSemVerVersionForParallelValidVersions(
                curr,
                listOf(
                    ExecutableVersionRange(min1, max1),
                    ExecutableVersionRange(min2, max2)
                ),
                name
            )
        }.isInstanceOf(RuntimeException::class.java)
    }

    @Test
    fun checkSemVerVersionForParallelValidVersionsThrowsIfBetweenTwoValidRanges() {
        val curr = SemVer("4.0.0", 4, 0, 0)
        val min1 = SemVer("1.0.1", 1, 0, 1)
        val max1 = SemVer("3.0.0", 3, 0, 0)
        val min2 = SemVer("4.0.1", 4, 0, 1)
        val max2 = SemVer("8.8.8", 8, 8, 8)
        val name = "Between two ranges"
        assertThatThrownBy {
            ExecutableCommon.checkSemVerVersionForParallelValidVersions(
                curr,
                listOf(
                    ExecutableVersionRange(min1, max1),
                    ExecutableVersionRange(min2, max2)
                ),
                name
            )
        }.isInstanceOf(RuntimeException::class.java)
    }
}
