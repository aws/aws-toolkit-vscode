// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import base.allowCustomDotnetRoots
import com.intellij.openapi.util.IconLoader
import com.jetbrains.rdclient.icons.toIdeaIcon
import com.jetbrains.rider.model.IconModel
import com.jetbrains.rider.test.annotations.TestEnvironment
import com.jetbrains.rider.test.base.BaseTestWithSolution
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.BeforeSuite
import org.testng.annotations.Test

class DotNetHandlerCompletionTest : BaseTestWithSolution() {

    override fun getSolutionDirectoryName(): String = ""

    override val waitForCaches = true

    // TODO: Remove when https://youtrack.jetbrains.com/issue/RIDER-47995 is fixed FIX_WHEN_MIN_IS_203
    @BeforeSuite
    fun allowDotnetRoots() {
        allowCustomDotnetRoots()
    }

    @Test(description = "Check a single handler is show in lookup when one is defined in a project.")
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
        val ideaIconSecond = iconModel?.toIdeaIcon(project) as? IconLoader.CachedImageIcon
        assertThat(ideaIconSecond).isNotNull
        assertThat(ideaIconSecond?.originalPath).isEqualTo(expectedPath)
    }
}
