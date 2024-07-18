// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.codewhisperer.inlay

import com.intellij.codeInsight.inline.completion.render.InlineCompletionLineRenderer
import com.intellij.codeInsight.inline.completion.render.InlineCompletionRenderTextBlock
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.xdebugger.ui.DebuggerColors

@Deprecated(
    "Shim is no longer needed in 242+"
)
object InlineCompletionRemoteRendererFactory {
    fun createLineInlay(editor: Editor, text: String): EditorCustomElementRenderer =
        InlineCompletionLineRenderer(editor, text, editor.colorsScheme.getAttributes(DebuggerColors.INLINED_VALUES_EXECUTION_LINE))

    fun createBlockInlays(editor: Editor, block: List<String>): List<EditorCustomElementRenderer> =
        block.map {
            InlineCompletionLineRenderer(
                editor,
                listOf(InlineCompletionRenderTextBlock(it, editor.colorsScheme.getAttributes(DebuggerColors.INLINED_VALUES_EXECUTION_LINE)))
            )
        }
}
