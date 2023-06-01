// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.inlay

import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.RecommendationChunk

class CodeWhispererInlayManager {
    fun updateInlays(states: InvocationContext, chunks: List<RecommendationChunk>) {
        val editor = states.requestContext.editor
        clearInlays(editor)

        chunks.forEach { chunk ->
            createCodeWhispererInlays(editor, chunk.inlayOffset, chunk.text, states.popup)
        }
    }

    private fun createCodeWhispererInlays(editor: Editor, startOffset: Int, inlayText: String, popup: JBPopup) {
        if (inlayText.isEmpty()) return
        val firstNewlineIndex = inlayText.indexOf("\n")
        val firstLine: String
        val otherLines: String
        if (firstNewlineIndex != -1 && firstNewlineIndex < inlayText.length - 1) {
            firstLine = inlayText.substring(0, firstNewlineIndex)
            otherLines = inlayText.substring(firstNewlineIndex + 1)
        } else {
            firstLine = inlayText
            otherLines = ""
        }

        val firstLineRenderer = CodeWhispererInlayInlineRenderer(firstLine)
        val inlineInlay = editor.inlayModel.addInlineElement(startOffset, true, firstLineRenderer)
        inlineInlay?.let { Disposer.register(popup, it) }

        if (otherLines.isEmpty()) {
            return
        }
        val otherLinesRenderer = CodeWhispererInlayBlockRenderer(otherLines)
        val blockInlay = editor.inlayModel.addBlockElement(
            startOffset,
            true,
            false,
            0,
            otherLinesRenderer
        )
        blockInlay?.let { Disposer.register(popup, it) }
    }

    fun clearInlays(editor: Editor) {
        editor.inlayModel.getInlineElementsInRange(
            0,
            editor.document.textLength,
            CodeWhispererInlayInlineRenderer::class.java
        ).forEach { disposable ->
            Disposer.dispose(disposable)
        }
        editor.inlayModel.getBlockElementsInRange(
            0,
            editor.document.textLength,
            CodeWhispererInlayBlockRenderer::class.java
        ).forEach { disposable ->
            Disposer.dispose(disposable)
        }
    }

    companion object {
        @JvmStatic
        fun getInstance(): CodeWhispererInlayManager = service()
    }
}
