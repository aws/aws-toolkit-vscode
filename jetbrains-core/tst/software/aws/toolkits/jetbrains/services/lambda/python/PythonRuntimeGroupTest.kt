// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.roots.ModuleRootModificationUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class PythonRuntimeGroupTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val sut = PythonRuntimeGroup()

    @Test
    fun testRuntimeDetection2x() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyTestSdk("2.7.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(Runtime.PYTHON2_7)
    }

    @Test
    fun testRuntimeDetection36() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyTestSdk("3.6.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(Runtime.PYTHON3_6)
    }

    @Test
    fun testRuntimeDetection37() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyTestSdk("3.7.0"))

        assertThat(sut.determineRuntime(module)).isEqualTo(Runtime.PYTHON3_7)
    }
}
