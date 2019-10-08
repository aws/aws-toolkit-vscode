// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.openapi.util.IconLoader
import com.jetbrains.rd.framework.impl.RpcTimeouts
import com.jetbrains.rdclient.icons.toIdeaIcon
import com.jetbrains.rider.model.IconModel
import com.jetbrains.rider.model.lambdaModel
import com.jetbrains.rider.projectView.solution
import com.jetbrains.rider.test.annotations.TestEnvironment
import com.jetbrains.rider.test.base.BaseTestWithSolution
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.Test
import software.amazon.awssdk.services.lambda.model.Runtime

class DotNetHandlerCompletionTest : BaseTestWithSolution() {

    override fun getSolutionDirectoryName(): String = ""

    override val waitForCaches = true

    @Test
    @TestEnvironment(solution = "SamHelloWorldApp")
    fun testCompletion_IsSupportedForDotNetRuntime() {
        val provider = HandlerCompletionProvider(project, Runtime.DOTNETCORE2_1)
        assertThat(provider.isCompletionSupported).isTrue()
    }

    @Test
    @TestEnvironment(solution = "SamHelloWorldApp")
    fun testDetermineHandlers_SingleHandler() {
        val handlers = project.solution.lambdaModel.determineHandlers.sync(Unit, RpcTimeouts.default)

        assertThat(handlers.size).isEqualTo(1)
        assertThat(handlers.first().handler).isEqualTo("HelloWorld::HelloWorld.Function::FunctionHandler")
        assertIconPath(handlers.first().iconId, "/resharper/PsiSymbols/Method.svg")
    }

    @Test
    @TestEnvironment(solution = "SamMultipleHandlersApp")
    fun testDetermineHandlers_MultipleHandlers() {
        val handlers = project.solution.lambdaModel.determineHandlers.sync(Unit, RpcTimeouts.default)

        assertThat(handlers.size).isEqualTo(2)

        assertThat(handlers[0].handler).isEqualTo("HelloWorld::HelloWorld.Function::FunctionHandler")
        assertIconPath(handlers[0].iconId, "/resharper/PsiSymbols/Method.svg")

        assertThat(handlers[1].handler).isEqualTo("HelloWorld::HelloWorld.Function2::FunctionHandler2")
        assertIconPath(handlers[1].iconId, "/resharper/PsiSymbols/Method.svg")
    }

    @Suppress("SameParameterValue")
    private fun assertIconPath(iconModel: IconModel?, expectedPath: String) {
        assertThat(iconModel).isNotNull
        val ideaIconSecond = iconModel?.toIdeaIcon(project) as? IconLoader.CachedImageIcon
        assertThat(ideaIconSecond).isNotNull
        assertThat(ideaIconSecond?.originalPath).isEqualTo(expectedPath)
    }
}
