// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.util.text.SemVer
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.setNodeJsInterpreterVersion

class NodeJsRuntimeGroupTest {

    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    private val sut = NodeJsRuntimeGroup()

    @Test
    fun testRuntime14() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v14.0.0", 14, 0, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(LambdaRuntime.NODEJS14_X)
    }

    @Test
    fun testRuntime150() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v15.16.0", 15, 16, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(LambdaRuntime.NODEJS16_X)
    }

    @Test
    fun testRuntime16() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v16.0.0", 16, 0, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(LambdaRuntime.NODEJS16_X)
    }

    @Test
    fun testRuntime18() {
        projectRule.project.setNodeJsInterpreterVersion(SemVer("v18.0.0", 18, 0, 0))
        val runtime = sut.determineRuntime(projectRule.project)
        assertThat(runtime).isEqualTo(LambdaRuntime.NODEJS18_X)
    }
}
