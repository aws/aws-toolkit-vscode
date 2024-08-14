// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.codewhisperer.inlay

import com.intellij.codeInsight.inline.completion.render.InlineBlockElementRenderer
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.xdebugger.ui.DebuggerColors

// from 232-241.1, we have `InlineSuffixRenderer`, but with 241.2+ it becomes `InlineCompletionLineRenderer`
// for both line and block inlays. Also InlineBlockElementRenderer is deprecated
// 242 is not yet handled by this
object InlineCompletionRemoteRendererFactory {
    private var hasOldLineConstructor = true
    private val lineConstructor = run {
        val clazz =
            try {
                Class.forName("com.intellij.codeInsight.inline.completion.render.InlineSuffixRenderer")
            } catch (e: ClassNotFoundException) {
                hasOldLineConstructor = false
                Class.forName("com.intellij.codeInsight.inline.completion.render.InlineCompletionLineRenderer")
            }
        if (hasOldLineConstructor) {
            clazz.getConstructor(Editor::class.java, String::class.java)
        } else {
            clazz.getConstructor(Editor::class.java, String::class.java, TextAttributes::class.java)
        }
    }
    private var hasNewBlockConstructor = true
    private val blockConstructor = run {
        val clazz =
            try {
                Class.forName("com.intellij.codeInsight.inline.completion.render.InlineCompletionLineRenderer")
            } catch (e: ClassNotFoundException) {
                hasNewBlockConstructor = false
                Class.forName("com.intellij.codeInsight.inline.completion.render.InlineBlockElementRenderer")
            }
        clazz.getConstructor(Editor::class.java, List::class.java)
    }

    fun createLineInlay(editor: Editor, text: String): EditorCustomElementRenderer =
        (
            if (hasOldLineConstructor) {
                lineConstructor.newInstance(editor, text)
            } else {
                lineConstructor.newInstance(editor, text, editor.colorsScheme.getAttributes(DebuggerColors.INLINED_VALUES_EXECUTION_LINE))
            }
            ) as EditorCustomElementRenderer

    fun createBlockInlays(editor: Editor, block: List<String>): List<EditorCustomElementRenderer> =
        if (hasNewBlockConstructor) {
            // 241.2+
            val textBlockClazz = Class.forName("com.intellij.codeInsight.inline.completion.render.InlineCompletionRenderTextBlock")
            val textBlockConstructor = textBlockClazz.getConstructor(String::class.java, TextAttributes::class.java)
            block.map {
                blockConstructor.newInstance(
                    editor,
                    listOf(textBlockConstructor.newInstance(it, editor.colorsScheme.getAttributes(DebuggerColors.INLINED_VALUES_EXECUTION_LINE)))
                ) as EditorCustomElementRenderer
            }
        } else {
            listOf(InlineBlockElementRenderer(editor, block))
        }
}
