// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import org.jetbrains.annotations.VisibleForTesting
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationChunk
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getCompletionType
import kotlin.math.max
import kotlin.math.min

@Service
class CodeWhispererRecommendationManager {
    fun reformatReference(requestContext: RequestContext, recommendation: Completion): Completion {
        // startOffset is the offset at the start of user input since invocation
        val invocationStartOffset = requestContext.caretPosition.offset

        val startOffsetSinceUserInput = requestContext.editor.caretModel.offset
        val endOffset = invocationStartOffset + recommendation.content().length

        if (startOffsetSinceUserInput > endOffset) return recommendation

        val reformattedReferences = recommendation.references().filter {
            val referenceStart = invocationStartOffset + it.recommendationContentSpan().start()
            val referenceEnd = invocationStartOffset + it.recommendationContentSpan().end()
            referenceStart < endOffset && referenceEnd > startOffsetSinceUserInput
        }.map {
            val referenceStart = invocationStartOffset + it.recommendationContentSpan().start()
            val referenceEnd = invocationStartOffset + it.recommendationContentSpan().end()
            val updatedReferenceStart = max(referenceStart, startOffsetSinceUserInput)
            val updatedReferenceEnd = min(referenceEnd, endOffset)
            it.toBuilder().recommendationContentSpan(
                Span.builder()
                    .start(updatedReferenceStart - invocationStartOffset)
                    .end(updatedReferenceEnd - invocationStartOffset)
                    .build()
            ).build()
        }

        return Completion.builder()
            .content(recommendation.content())
            .references(reformattedReferences)
            .build()
    }

    fun buildRecommendationChunks(
        recommendation: String,
        matchingSymbols: List<Pair<Int, Int>>
    ): List<RecommendationChunk> = matchingSymbols
        .dropLast(1)
        .mapIndexed { index, (offset, inlayOffset) ->
            val end = matchingSymbols[index + 1].first - 1
            RecommendationChunk(recommendation.substring(offset, end), offset, inlayOffset)
        }

    fun buildDetailContext(
        requestContext: RequestContext,
        userInput: String,
        recommendations: List<Completion>,
        requestId: String,
    ): List<DetailContext> {
        val seen = mutableSetOf<String>()
        return recommendations.map {
            val isDiscardedByUserInput = !it.content().startsWith(userInput) || it.content() == userInput
            if (isDiscardedByUserInput) {
                return@map DetailContext(
                    requestId,
                    it,
                    it,
                    isDiscarded = true,
                    isTruncatedOnRight = false,
                    rightOverlap = "",
                    getCompletionType(it)
                )
            }

            val overlap = findRightContextOverlap(requestContext, it)
            val overlapIndex = it.content().lastIndexOf(overlap)
            val truncatedContent =
                if (overlap.isNotEmpty() && overlapIndex >= 0) {
                    it.content().substring(0, overlapIndex)
                } else {
                    it.content()
                }
            val truncated = it.toBuilder()
                .content(truncatedContent)
                .build()
            val isDiscardedByUserInputForTruncated = !truncated.content().startsWith(userInput) || truncated.content() == userInput
            if (isDiscardedByUserInputForTruncated) {
                return@map DetailContext(
                    requestId,
                    it,
                    truncated,
                    isDiscarded = true,
                    isTruncatedOnRight = true,
                    rightOverlap = overlap,
                    getCompletionType(it)
                )
            }

            val isDiscardedByRightContextTruncationDedupe = !seen.add(truncated.content())
            val isDiscardedByBlankAfterTruncation = truncated.content().isBlank()
            if (isDiscardedByRightContextTruncationDedupe || isDiscardedByBlankAfterTruncation) {
                return@map DetailContext(
                    requestId,
                    it,
                    truncated,
                    isDiscarded = true,
                    truncated.content().length != it.content().length,
                    overlap,
                    getCompletionType(it)
                )
            }
            val reformatted = reformatReference(requestContext, truncated)
            DetailContext(
                requestId,
                it,
                reformatted,
                isDiscarded = false,
                truncated.content().length != it.content().length,
                overlap,
                getCompletionType(it)
            )
        }
    }

    fun findRightContextOverlap(
        requestContext: RequestContext,
        recommendation: Completion
    ): String {
        val document = requestContext.editor.document
        val caret = requestContext.editor.caretModel.primaryCaret
        val rightContext = document.charsSequence.subSequence(caret.offset, document.charsSequence.length).toString()
        val recommendationContent = recommendation.content()
        return findRightContextOverlap(rightContext, recommendationContent)
    }

    @VisibleForTesting
    fun findRightContextOverlap(rightContext: String, recommendationContent: String): String {
        val rightContextFirstLine = rightContext.substringBefore("\n")
        val overlap =
            if (rightContextFirstLine.isEmpty()) {
                val tempOverlap = overlap(recommendationContent, rightContext)
                if (tempOverlap.isEmpty()) overlap(recommendationContent.trimEnd(), trimExtraPrefixNewLine(rightContext)) else tempOverlap
            } else {
                // this is necessary to prevent display issue if first line of right context is not empty
                var tempOverlap = overlap(recommendationContent, rightContext)
                if (tempOverlap.isEmpty()) {
                    tempOverlap = overlap(recommendationContent.trimEnd(), trimExtraPrefixNewLine(rightContext))
                }
                if (recommendationContent.substring(0, recommendationContent.length - tempOverlap.length).none { it == '\n' }) {
                    tempOverlap
                } else {
                    ""
                }
            }
        return overlap
    }

    fun overlap(first: String, second: String): String {
        for (i in max(0, first.length - second.length) until first.length) {
            val suffix = first.substring(i)
            if (second.startsWith(suffix)) {
                return suffix
            }
        }
        return ""
    }

    companion object {
        fun getInstance(): CodeWhispererRecommendationManager = service()

        /**
         * a function to trim extra prefixing new line character (only leave 1 new line character)
         * example:
         *  content = "\n\n\nfoo\n\nbar\nbaz"
         *  return = "\nfoo\n\nbar\nbaz"
         *
         * example:
         *  content = "\n\n\tfoobar\nbaz"
         *  return = "\n\tfoobar\nbaz"
         */
        fun trimExtraPrefixNewLine(content: String): String {
            if (content.isEmpty()) {
                return ""
            }

            val firstChar = content.first()
            if (firstChar != '\n') {
                return content
            }

            var index = 1
            while (index < content.length && content[index] == '\n') {
                index++
            }

            return firstChar + content.substring(index)
        }
    }
}
