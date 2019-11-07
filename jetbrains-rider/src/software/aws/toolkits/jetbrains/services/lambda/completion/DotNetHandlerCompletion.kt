// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.codeInsight.completion.PrefixMatcher
import com.intellij.codeInsight.completion.impl.CamelHumpMatcher
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.project.Project
import com.intellij.openapi.rd.defineNestedLifetime
import com.jetbrains.rd.framework.impl.RpcTimeouts
import com.jetbrains.rd.util.AtomicInteger
import com.jetbrains.rd.util.spinUntil
import com.jetbrains.rd.util.threading.SynchronousScheduler
import com.jetbrains.rdclient.icons.FrontendIconHost
import com.jetbrains.rider.model.DetermineHandlersRequest
import com.jetbrains.rider.model.HandlerCompletionItem
import com.jetbrains.rider.model.lambdaPsiModel
import com.jetbrains.rider.projectView.solution
import org.jetbrains.annotations.TestOnly

class DotNetHandlerCompletion : HandlerCompletion {

    private companion object {
        val handlerRequestId = AtomicInteger(1)
        val handlerRequestTimeoutMs = RpcTimeouts.default.errorAwaitTime
    }

    override fun getPrefixMatcher(prefix: String): PrefixMatcher = CamelHumpMatcher(prefix)

    override fun getLookupElements(project: Project): Collection<LookupElement> {
        val completionItems = getHandlersFromBackend(project)
        return completionItems.map { completionItem ->
            LookupElementBuilder.create(completionItem.handler).let {
                if (completionItem.iconId != null) it.withIcon(FrontendIconHost.getInstance(project).toIdeaIcon(completionItem.iconId))
                else it
            }
        }
    }

    @TestOnly
    fun getHandlersFromBackend(project: Project): List<HandlerCompletionItem> {
        val model = project.solution.lambdaPsiModel
        val lifetime = project.defineNestedLifetime()

        return try {
            val requestId = handlerRequestId.getAndIncrement()

            var handlersValue: List<HandlerCompletionItem>? = null

            model.determineHandlersResponse.adviseOn(lifetime, SynchronousScheduler) { response ->
                if (response.requestId == requestId) {
                    handlersValue = response.value
                }
            }

            model.determineHandlersRequest.fire(DetermineHandlersRequest(requestId))

            spinUntil(handlerRequestTimeoutMs) { handlersValue != null }

            handlersValue ?: throw IllegalStateException("Timeout after $handlerRequestTimeoutMs ms waiting for available handlers calculation")
        } finally {
            lifetime.terminate()
        }
    }
}
