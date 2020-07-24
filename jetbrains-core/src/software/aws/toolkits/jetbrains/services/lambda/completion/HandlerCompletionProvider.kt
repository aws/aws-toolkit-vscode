// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.lookup.CharFilter.Result
import com.intellij.openapi.project.Project
import com.intellij.util.textCompletion.TextCompletionProvider
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import java.lang.IllegalStateException

class HandlerCompletionProvider(private val project: Project, runtime: Runtime?) : TextCompletionProvider {

    private val logger = getLogger<HandlerCompletionProvider>()

    private val handlerCompletion: HandlerCompletion? by lazy {
        val runtimeGroup = runtime?.runtimeGroup ?: RuntimeGroup.determineRuntime(project)?.runtimeGroup ?: return@lazy null

        return@lazy HandlerCompletion.getInstance(runtimeGroup) ?: let {
            logger.info { "Lambda handler completion provider is not registered for runtime: ${runtimeGroup.name}. Completion is not supported." }
            null
        }
    }

    val isCompletionSupported by lazy { handlerCompletion != null }

    override fun applyPrefixMatcher(result: CompletionResultSet, prefix: String): CompletionResultSet {
        if (!isCompletionSupported) return result

        val completion = handlerCompletion
            ?: throw IllegalStateException("handlerCompletion must be defined if completion is enabled.")

        val prefixMatcher = completion.getPrefixMatcher(prefix)
        return result.withPrefixMatcher(prefixMatcher)
    }

    override fun getAdvertisement(): String? = null

    override fun getPrefix(text: String, offset: Int): String? = text

    override fun fillCompletionVariants(parameters: CompletionParameters, prefix: String, result: CompletionResultSet) {
        if (!isCompletionSupported) return

        val lookupElements = handlerCompletion!!.getLookupElements(project)
        result.addAllElements(lookupElements)
        result.stopHere()
    }

    override fun acceptChar(char: Char): Result? {
        if (!isCompletionSupported) return Result.HIDE_LOOKUP

        return when {
            char == ':' || char == '.' || Character.isLetterOrDigit(char) -> Result.ADD_TO_PREFIX
            else -> null
        }
    }
}
