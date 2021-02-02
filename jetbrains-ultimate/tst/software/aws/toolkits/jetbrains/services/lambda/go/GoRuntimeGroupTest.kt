// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ModuleRootModificationUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.utils.rules.GoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.createMockSdk

class GoRuntimeGroupTest {
    @Rule
    @JvmField
    val projectRule = GoCodeInsightTestFixtureRule()

    private val sut = GoRuntimeGroup()

    @Test
    fun testRuntime0x() {
        val module = projectRule.module

        WriteAction.computeAndWait<Unit, Throwable> {
            val sdk = createMockSdk("0.99.99")
            ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.testRootDisposable)
            ModuleRootModificationUtil.setModuleSdk(module, sdk)
        }

        val runtime = sut.determineRuntime(module)
        assertThat(runtime).isEqualTo(null)
    }

    @Test
    fun testRuntime1x() {
        val module = projectRule.module

        WriteAction.computeAndWait<Unit, Throwable> {
            val sdk = createMockSdk("1.0.0")
            ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.testRootDisposable)
            ModuleRootModificationUtil.setModuleSdk(module, sdk)
        }

        val runtime = sut.determineRuntime(module)
        assertThat(runtime).isEqualTo(LambdaRuntime.GO1_X)
    }

    @Test
    fun testRuntime2x() {
        val module = projectRule.module

        WriteAction.computeAndWait<Unit, Throwable> {
            val sdk = createMockSdk("2.0.0")
            ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.testRootDisposable)
            ModuleRootModificationUtil.setModuleSdk(module, sdk)
        }

        val runtime = sut.determineRuntime(module)
        assertThat(runtime).isEqualTo(null)
    }
}
