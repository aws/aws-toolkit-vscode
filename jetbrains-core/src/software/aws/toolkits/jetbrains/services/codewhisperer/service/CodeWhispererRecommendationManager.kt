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
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.amazon.awssdk.services.codewhisperer.model.Reference
import software.amazon.awssdk.services.codewhisperer.model.Span
import software.aws.toolkits.jetbrains.services.codewhisperer.model.DetailContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationChunk
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings

class CodeWhispererRecommendationManager {
    fun reformat(requestContext: RequestContext, recommendation: Recommendation): Recommendation {
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
            rangeMarkers[
                tempDocument.createRangeMarker(
                    invocationStartOffset + it.recommendationContentSpan().start(),
                    invocationStartOffset + it.recommendationContentSpan().end()
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
        return Recommendation.builder()
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
        recommendations: List<Recommendation>,
        requestId: String,
    ): List<DetailContext> = recommendations.map {
        val isDiscarded = !it.content().startsWith(userInput)
        val isDiscardedByReferenceFilter = it.hasReferences() &&
            !CodeWhispererSettings.getInstance().isIncludeCodeWithReference()
        DetailContext(requestId, it, reformat(requestContext, it), isDiscarded || isDiscardedByReferenceFilter)
    }

    companion object {
        fun getInstance(): CodeWhispererRecommendationManager = service()
    }
}
