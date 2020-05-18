// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.util.text.SemVer
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.setNodeJsInterpreterVersion

class NodeJsRuntimeGroupTest {

    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    private val sut = NodeJsRuntimeGroup()

    @Test
    fun testRuntime4_3() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v4.3.0", 4, 3, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(Runtime.NODEJS10_X)
    }

    @Test
    fun testRuntime6_10() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v6.10.3", 6, 10, 3))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(Runtime.NODEJS10_X)
    }

    @Test
    fun testRuntime8_10() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v8.10.0", 8, 10, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(Runtime.NODEJS10_X)
    }

    @Test
    fun testRuntime10_10() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v10.10.0", 10, 10, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(Runtime.NODEJS10_X)
    }

    @Test
    fun testRuntime11_12() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v11.12.0", 11, 12, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(Runtime.NODEJS12_X)
    }

    @Test
    fun testRuntime12_13() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v12.13.1", 12, 13, 1))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(Runtime.NODEJS12_X)
    }

    @Test
    fun testRuntime13_0() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v13.0.0", 13, 0, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isNull()
    }
}
