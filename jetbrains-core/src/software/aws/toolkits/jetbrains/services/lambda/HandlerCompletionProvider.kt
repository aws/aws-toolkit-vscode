// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.PlainPrefixMatcher
import com.intellij.codeInsight.lookup.CharFilter
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.project.Project
import com.intellij.util.textCompletion.TextCompletionProvider

class HandlerCompletionProvider(private val project: Project) : TextCompletionProvider {
    override fun applyPrefixMatcher(result: CompletionResultSet, prefix: String): CompletionResultSet =
        result.withPrefixMatcher(PlainPrefixMatcher(prefix))

    override fun getAdvertisement(): String? = null

    override fun getPrefix(text: String, offset: Int): String? = text

    override fun fillCompletionVariants(parameters: CompletionParameters, prefix: String, result: CompletionResultSet) {
        LambdaHandlerIndex.listHandlers(project).forEach { result.addElement(LookupElementBuilder.create(it)) }
        result.stopHere()
    }

    override fun acceptChar(c: Char): CharFilter.Result? = if (c.isWhitespace()) {
        CharFilter.Result.SELECT_ITEM_AND_FINISH_LOOKUP
    } else {
        CharFilter.Result.ADD_TO_PREFIX
    }
}