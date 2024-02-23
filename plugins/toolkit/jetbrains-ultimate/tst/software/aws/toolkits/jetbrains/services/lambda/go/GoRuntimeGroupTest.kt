// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.sdk.GoSdkService
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.utils.rules.GoCodeInsightTestFixtureRule

class GoRuntimeGroupTest {
    @Rule
    @JvmField
    val projectRule = GoCodeInsightTestFixtureRule()

    private val sut = GoRuntimeGroup()

    @Test
    fun runtimeForSdk() {
        val goSdkService = spy(GoSdkService.getInstance(projectRule.project))
        whenever(goSdkService.isGoModule(any())).thenReturn(true)
        projectRule.project.replaceService(GoSdkService::class.java, goSdkService, projectRule.fixture.projectDisposable)

        val module = projectRule.module
        val runtime = sut.determineRuntime(module)
        assertThat(runtime).isEqualTo(LambdaRuntime.GO1_X)
    }
}
