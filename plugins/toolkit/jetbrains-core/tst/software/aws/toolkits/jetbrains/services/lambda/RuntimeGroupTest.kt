// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.python.PythonLanguage
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.lambda.validOrNull
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class RuntimeGroupTest {

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun canDetermineRuntimeFromAnActionEventUsingModule() {
        val sdk = PyTestSdk.create("3.9.0")
        projectRule.setModuleSdk(projectRule.module, sdk)

        val event: AnActionEvent = mock {
            on { getData(LangDataKeys.LANGUAGE) }.thenReturn(PythonLanguage.INSTANCE)
            on { getData(LangDataKeys.MODULE) }.thenReturn(projectRule.module)
        }

        assertThat(event.runtime()).isEqualTo(LambdaRuntime.PYTHON3_9)
    }

    @Test
    fun canDetermineRuntimeFromAnActionEventUsingProject() {
        val sdk = PyTestSdk.create("3.9.0")

        val project = projectRule.project

        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(project).projectSdk = sdk
            }

            val event: AnActionEvent = mock {
                on { getData(LangDataKeys.LANGUAGE) }.thenReturn(PythonLanguage.INSTANCE)
                on { getData(LangDataKeys.MODULE) }.thenReturn(null)
                on { getData(LangDataKeys.PROJECT) }.thenReturn(projectRule.project)
            }

            assertThat(event.runtime()).isEqualTo(LambdaRuntime.PYTHON3_9)
        }
    }

    @Test
    fun unknownRuntimeIsNull() {
        assertThat(Runtime.fromValue("adsfadsffads")).isEqualTo(Runtime.UNKNOWN_TO_SDK_VERSION)
        assertThat(Runtime.fromValue("adsfadsffads").validOrNull).isNull()
    }
}
