// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import base.allowCustomDotnetRoots
import base.msBuild
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.util.SystemInfo
import com.jetbrains.rider.test.annotations.TestEnvironment
import com.jetbrains.rider.test.base.BaseTestWithSolution
import com.jetbrains.rider.test.base.PrepareTestEnvironment
import com.jetbrains.rider.test.scriptingApi.setUpCustomToolset
import com.jetbrains.rider.test.scriptingApi.setUpDotNetCoreCliPath
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.BeforeClass
import org.testng.annotations.BeforeSuite
import org.testng.annotations.Test
import software.aws.toolkits.jetbrains.rider.compatability.IconModel

class DotNetHandlerCompletionTest : BaseTestWithSolution() {

    override fun getSolutionDirectoryName(): String = ""

    override val waitForCaches = true

    // TODO: Remove when https://youtrack.jetbrains.com/issue/RIDER-47995 is fixed FIX_WHEN_MIN_IS_203
    @BeforeSuite
    fun allowDotnetRoots() {
        allowCustomDotnetRoots()
    }

    @BeforeClass
    fun setUpBuildToolPath() {
        if (SystemInfo.isWindows) {
            PrepareTestEnvironment.dotnetCoreCliPath = "C:\\Program Files\\dotnet\\dotnet.exe"
            setUpDotNetCoreCliPath(PrepareTestEnvironment.dotnetCoreCliPath)
            setUpCustomToolset(msBuild)
        }
    }

    @Test(description = "Check a single handler is shown in lookup when one is defined in a project.")
    @TestEnvironment(solution = "SamHelloWorldApp")
    fun testDetermineHandlers_SingleHandler() {
        val handlers = DotNetHandlerCompletion().getHandlersFromBackend(project)

        assertThat(handlers.size).isEqualTo(1)
        assertThat(handlers.first().handler).isEqualTo("HelloWorld::HelloWorld.Function::FunctionHandler")
        assertIconPath(handlers.first().iconId, "/resharper/PsiSymbols/Method.svg")
    }

    // TODO this test only works on 2019.2. Which we don't support anymore. Fix the test
    // TODO: This test is failing due to handlers detection logic. I assume it need to be fixed if test is correct.
    @Test(enabled = false, description = "Check all handlers are show in completion lookup when multiple handlers are defined in a project.")
    @TestEnvironment(solution = "SamMultipleHandlersApp")
    fun testDetermineHandlers_MultipleHandlers() {
        val handlers = DotNetHandlerCompletion().getHandlersFromBackend(project).sortedBy { it.handler }

        assertThat(handlers.size).isEqualTo(3)

        assertThat(handlers[0].handler).isEqualTo("HelloWorld::HelloWorld.Function::FunctionHandler")
        assertIconPath(handlers[0].iconId, "/resharper/PsiSymbols/Method.svg")

        assertThat(handlers[1].handler).isEqualTo("HelloWorld::HelloWorld.FunctionWithObjectReturn::Handler")
        assertIconPath(handlers[1].iconId, "/resharper/PsiSymbols/Method.svg")

        assertThat(handlers[2].handler).isEqualTo("HelloWorld::HelloWorld.FunctionWithOnlyLambdaContext::Handler")
        assertIconPath(handlers[2].iconId, "/resharper/PsiSymbols/Method.svg")
    }

    @Suppress("SameParameterValue")
    private fun assertIconPath(iconModel: IconModel?, expectedPath: String) {
        assertThat(iconModel).isNotNull
        val ideaIconSecond = iconModel?.let { completionItemToIcon(project, iconModel) as? IconLoader.CachedImageIcon }
        assertThat(ideaIconSecond).isNotNull
        // FIX_WHEN_MIN_IS_211 The icon path changed on 211 to not have a leading slash. This comes
        // straight from the backend (`_psiIconManager.GetImage(method.GetElementType())`). For what it's worth
        // originalPath is probably marked unstable for a reason
        if (ApplicationInfo.getInstance().let { info -> info.majorVersion == "2020" }) {
            assertThat(ideaIconSecond?.originalPath).isEqualTo(expectedPath)
        } else {
            assertThat(ideaIconSecond?.originalPath).isEqualTo(expectedPath.trimStart('/'))
        }
    }
}
