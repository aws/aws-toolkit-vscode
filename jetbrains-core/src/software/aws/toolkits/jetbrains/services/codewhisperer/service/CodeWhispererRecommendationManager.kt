// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.util.LocalTimeCounter
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationChunk
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getCompletionType
import kotlin.math.max

class CodeWhispererRecommendationManager {
    fun reformat(requestContext: RequestContext, recommendation: Completion): Completion {
        val project = requestContext.project
        val editor = requestContext.editor
        val document = editor.document

        // startOffset is the offset at the start of user input since invocation
        val invocationStartOffset = requestContext.caretPosition.offset
        val startOffsetSinceUserInput = editor.caretModel.offset

        // Create a temp file for capturing reformatted text and updated content spans
        val tempPsiFile = PsiDocumentManager.getInstance(project).getPsiFile(document)?.let { psiFile ->
            PsiFileFactory.getInstance(project).createFileFromText(
                "codewhisperer_temp",
                psiFile.fileType,
                document.text,
                LocalTimeCounter.currentTime(),
                true
            )
        }
        val tempDocument = tempPsiFile?.let { psiFile ->
            PsiDocumentManager.getInstance(project).getDocument(psiFile)
        } ?: return recommendation

        val endOffset = invocationStartOffset + recommendation.content().length
        if (startOffsetSinceUserInput > endOffset) return recommendation
        WriteCommandAction.runWriteCommandAction(project) {
            tempDocument.insertString(invocationStartOffset, recommendation.content())
            PsiDocumentManager.getInstance(project).commitDocument(tempDocument)
        }
        val rangeMarkers = mutableMapOf<RangeMarker, Reference>()
        recommendation.references().forEach {
            val referenceStart = invocationStartOffset + it.recommendationContentSpan().start()
            if (referenceStart >= endOffset) return@forEach
            val tempEnd = invocationStartOffset + it.recommendationContentSpan().end()
            val referenceEnd = if (tempEnd <= endOffset) tempEnd else endOffset
            rangeMarkers[
                tempDocument.createRangeMarker(
                    referenceStart,
                    referenceEnd
                )
            ] = it
        }
        val tempRangeMarker = tempDocument.createRangeMarker(invocationStartOffset, endOffset)

        // Currently, only reformat(adjust line indent) starting from user's input
        WriteCommandAction.runWriteCommandAction(project) {
            CodeStyleManager.getInstance(project).adjustLineIndent(tempPsiFile, TextRange(startOffsetSinceUserInput, endOffset))
        }

        val reformattedRecommendation = tempDocument.getText(TextRange(tempRangeMarker.startOffset, tempRangeMarker.endOffset))

        val reformattedReferences = rangeMarkers.map { (rangeMarker, reference) ->
            reformatReference(reference, rangeMarker, invocationStartOffset)
        }
        return Completion.builder()
            .content(reformattedRecommendation)
            .references(reformattedReferences)
            .build()
    }

    /**
     * Build new reference with updated contentSpan(start and end). Since it's reformatted, take the new start and
     * end from the rangeMarker which automatically tracks the range after reformatting
     */
    fun reformatReference(originalReference: Reference, rangeMarker: RangeMarker, invocationStartOffset: Int): Reference {
        rangeMarker.apply {
            val documentContent = document.charsSequence

            // has to plus 1 because right boundary is exclusive
            val spanEndOffset = documentContent.subSequence(0, endOffset).indexOfLast { char -> char != '\n' } + 1
            return originalReference
                .toBuilder()
                .recommendationContentSpan(
                    Span.builder()
                        .start(startOffset - invocationStartOffset)
                        .end(spanEndOffset - invocationStartOffset)
                        .build()
                )
                .build()
        }
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

            val reformatted = reformat(requestContext, truncated)
            val isDiscardedByRightContextTruncationDedupe = !seen.add(reformatted.content())
            DetailContext(
                requestId,
                it,
                reformatted,
                isDiscardedByRightContextTruncationDedupe,
                truncated.content().length != it.content().length,
                overlap,
                getCompletionType(it)
            )
        }
    }

    private fun findRightContextOverlap(
        requestContext: RequestContext,
        recommendation: Completion
    ): String {
        val document = requestContext.editor.document
        val caret = requestContext.editor.caretModel.primaryCaret
        val rightContext = document.charsSequence.subSequence(caret.offset, document.charsSequence.length).toString()
        val recommendationContent = recommendation.content()
        val rightContextFirstLine = rightContext.substringBefore("\n")
        val overlap =
            if (rightContextFirstLine.isEmpty()) {
                val tempOverlap = overlap(recommendationContent, rightContext)
                if (tempOverlap.isEmpty()) overlap(recommendationContent.trimEnd(), rightContext.trimStart()) else tempOverlap
            } else {
                // this is necessary to prevent display issue if first line of right context is not empty
                var tempOverlap = overlap(recommendationContent, rightContext)
                if (tempOverlap.isEmpty()) {
                    tempOverlap = overlap(recommendationContent.trimEnd(), rightContext.trimStart())
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
    }
}
