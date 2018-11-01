// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.roots.ModuleRootModificationUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk2x
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk3x
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class PythonRuntimeGroupTest {

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val sut = PythonRuntimeGroup()

    @Test
    fun testRuntimeDetection2x() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyTestSdk2x())

        assertThat(sut.determineRuntime(module)).isEqualTo(Runtime.PYTHON2_7)
    }

    @Test
    fun testRuntimeDetection3x() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyTestSdk3x())

        assertThat(sut.determineRuntime(module)).isEqualTo(Runtime.PYTHON3_6)
    }
}