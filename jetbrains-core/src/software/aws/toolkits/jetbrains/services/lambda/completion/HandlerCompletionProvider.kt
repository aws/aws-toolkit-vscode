// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.lookup.CharFilter
import com.intellij.openapi.project.Project
import com.intellij.util.textCompletion.TextCompletionProvider
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import java.lang.IllegalStateException

class HandlerCompletionProvider(private val project: Project, runtime: Runtime? = null) : TextCompletionProvider {

    private val logger = getLogger<HandlerCompletionProvider>()

    private val handlerCompletion: HandlerCompletion? by lazy {
        val runtimeGroup = runtime?.runtimeGroup ?: RuntimeGroup.determineRuntime(project)?.runtimeGroup

        if (runtimeGroup == null) {
            val message = "Unable to define Runtime Group for Lambda handler completion provider"
            logger.error { message }
            throw IllegalStateException(message)
        }

        return@lazy HandlerCompletion.getInstance(runtimeGroup) ?: let {
            logger.info { "Lambda handler completion provider is not registered for runtime: ${runtimeGroup.name}. Completion is not supported." }
            null
        }
    }

    val isCompletionSupported by lazy { handlerCompletion != null }

    override fun applyPrefixMatcher(result: CompletionResultSet, prefix: String): CompletionResultSet {
        if (!isCompletionSupported) return result

        val prefixMatcher = handlerCompletion!!.getPrefixMatcher(prefix)
        result.withPrefixMatcher(prefixMatcher)
        return result
    }

    override fun getAdvertisement(): String? = null

    override fun getPrefix(text: String, offset: Int): String? = text

    override fun fillCompletionVariants(parameters: CompletionParameters, prefix: String, result: CompletionResultSet) {
        if (!isCompletionSupported) return

        val lookupElements = handlerCompletion!!.getLookupElements(project)
        result.addAllElements(lookupElements)
        result.stopHere()
    }

    override fun acceptChar(c: Char): CharFilter.Result? {
        if (!isCompletionSupported) return CharFilter.Result.HIDE_LOOKUP

        return when {
            c.isWhitespace() -> CharFilter.Result.SELECT_ITEM_AND_FINISH_LOOKUP
            else -> CharFilter.Result.ADD_TO_PREFIX
        }
    }
}
