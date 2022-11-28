// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.popup

import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorManager
import software.aws.toolkits.jetbrains.services.codewhisperer.inlay.CodeWhispererInlayManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationChunk
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererRecommendationManager

class CodeWhispererUIChangeListener : CodeWhispererPopupStateChangeListener {
    override fun stateChanged(states: InvocationContext, sessionContext: SessionContext) {
        val editor = states.requestContext.editor
        val editorManager = CodeWhispererEditorManager.getInstance()
        val selectedIndex = sessionContext.selectedIndex
        val typeahead = sessionContext.typeahead
        val detail = states.recommendationContext.details[selectedIndex]

        // get matching brackets from recommendations to the brackets after caret position
        val remaining = CodeWhispererPopupManager.getInstance().getReformattedRecommendation(
            detail, states.recommendationContext.userInputSinceInvocation
        ).substring(typeahead.length)

        val remainingLines = remaining.split("\n")
        val firstLineOfRemaining = remainingLines.first()
        val otherLinesOfRemaining = remainingLines.drop(1)

        // process first line inlays, where we do subsequence matching as much as possible
        val (matchingSymbols, isFirstLineFullMatching) = editorManager.getMatchingSymbolsFromRecommendation(
            editor, firstLineOfRemaining, detail.isTruncatedOnRight
        )
        val chunks = CodeWhispererRecommendationManager.getInstance().buildRecommendationChunks(
            firstLineOfRemaining,
            matchingSymbols
        )

        // process other lines inlays, where we do tail-head matching as much as possible
        val overlappingLinesCount = editorManager.findOverLappingLines(
            editor,
            otherLinesOfRemaining,
            isFirstLineFullMatching,
            detail.isTruncatedOnRight,
            states.popup,
        )

        var otherLinesInlayText = ""
        otherLinesOfRemaining.subList(0, otherLinesOfRemaining.size - overlappingLinesCount).forEach {
            otherLinesInlayText += "\n" + it
        }

        // inlay chunks are chunks from first line(chunks) and an additional chunk from other lines
        val inlayChunks = chunks + listOf(RecommendationChunk(otherLinesInlayText, 0, chunks.last().inlayOffset))
        CodeWhispererInlayManager.getInstance().updateInlays(states, inlayChunks)
        CodeWhispererPopupManager.getInstance().render(states, sessionContext, overlappingLinesCount)
    }

    override fun scrolled(states: InvocationContext, sessionContext: SessionContext) {
        if (states.popup.isDisposed) return
        val editor = states.requestContext.editor
        val editorManager = CodeWhispererEditorManager.getInstance()
        val selectedIndex = sessionContext.selectedIndex
        val typeahead = sessionContext.typeahead
        val detail = states.recommendationContext.details[selectedIndex]

        // get matching brackets from recommendations to the brackets after caret position
        val remaining = CodeWhispererPopupManager.getInstance().getReformattedRecommendation(
            detail, states.recommendationContext.userInputSinceInvocation
        ).substring(typeahead.length)

        val remainingLines = remaining.split("\n")
        val firstLineOfRemaining = remainingLines.first()
        val otherLinesOfRemaining = remainingLines.drop(1)

        // process first line inlays, where we do subsequence matching as much as possible
        val (_, isFirstLineFullMatching) = editorManager.getMatchingSymbolsFromRecommendation(
            editor, firstLineOfRemaining, detail.isTruncatedOnRight
        )

        // process other lines inlays, where we do tail-head matching as much as possible
        val overlappingLinesCount = editorManager.findOverLappingLines(
            editor,
            otherLinesOfRemaining,
            isFirstLineFullMatching,
            detail.isTruncatedOnRight,
            states.popup
        )

        CodeWhispererPopupManager.getInstance().render(states, sessionContext, overlappingLinesCount)
    }

    override fun recommendationAdded(states: InvocationContext, sessionContext: SessionContext) {
        CodeWhispererPopupManager.getInstance().updatePopupPanel(states, sessionContext)
    }
}
