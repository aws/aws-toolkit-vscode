// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder

class CreateFunctionDialogTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun `dialog only shows runtimes we can build`() {
        val dialog = runInEdtAndGet {
            CreateFunctionDialog(project = projectRule.project, initialRuntime = null, handlerName = null)
        }
        assertThat(dialog.getViewForTestAssertions().configSettings.runtimeModel.items)
            .containsExactlyInAnyOrderElementsOf(LambdaBuilder.supportedRuntimeGroups().flatMap { it.supportedSdkRuntimes })
    }
}
