// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class PythonRuntimeGroupTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val sut = PythonRuntimeGroup()

    @Test
    fun testRuntimeDetection38() {
        val module = projectRule.module
        projectRule.setModuleSdk(module, PyTestSdk.create("3.8.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(LambdaRuntime.PYTHON3_8)
    }

    @Test
    fun testRuntimeDetection39() {
        val module = projectRule.module
        projectRule.setModuleSdk(module, PyTestSdk.create("3.9.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(LambdaRuntime.PYTHON3_9)
    }

    @Test
    fun testRuntimeDetection310() {
        val module = projectRule.module
        projectRule.setModuleSdk(module, PyTestSdk.create("3.10.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(LambdaRuntime.PYTHON3_10)
    }

    @Test
    fun testRuntimeDetection311() {
        val module = projectRule.module
        projectRule.setModuleSdk(module, PyTestSdk.create("3.11.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(LambdaRuntime.PYTHON3_11)
    }

    @Test
    fun testRuntimeDetection312() {
        val module = projectRule.module
        // PythonCodeInsightTestFixtureRule already sets SDK to 3.12
        // projectRule.setModuleSdk(module, PyTestSdk.create("3.12.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(LambdaRuntime.PYTHON3_12)
    }
}
