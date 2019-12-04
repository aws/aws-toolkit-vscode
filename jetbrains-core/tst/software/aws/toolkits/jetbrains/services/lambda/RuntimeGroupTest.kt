// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.python.PythonLanguage
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class RuntimeGroupTest {

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun canDetermineRuntimeFromAnActionEventUsingModule() {
        ModuleRootModificationUtil.setModuleSdk(projectRule.module, PyTestSdk("2.7.0"))
        val event: AnActionEvent = mock {
            on { getData(LangDataKeys.LANGUAGE) }.thenReturn(PythonLanguage.INSTANCE)
            on { getData(LangDataKeys.MODULE) }.thenReturn(projectRule.module)
        }

        assertThat(event.runtime()).isEqualTo(Runtime.PYTHON2_7)
    }

    @Test
    fun canDetermineRuntimeFromAnActionEventUsingProject() {
        val sdk = PyTestSdk("3.6.0")

        val project = projectRule.project

        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(project).projectSdk = PyTestSdk("3.6.0")
            }

            val event: AnActionEvent = mock {
                on { getData(LangDataKeys.LANGUAGE) }.thenReturn(PythonLanguage.INSTANCE)
                on { getData(LangDataKeys.MODULE) }.thenReturn(null)
                on { getData(LangDataKeys.PROJECT) }.thenReturn(projectRule.project)
            }

            assertThat(event.runtime()).isEqualTo(Runtime.PYTHON3_6)
        }
    }

    @Test
    fun unknownRuntimeIsNull() {
        assertThat(Runtime.fromValue("adsfadsffads")).isEqualTo(Runtime.UNKNOWN_TO_SDK_VERSION)
        assertThat(Runtime.fromValue("adsfadsffads").validOrNull).isNull()
    }
}
