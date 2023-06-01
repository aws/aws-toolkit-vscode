// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.inlay

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.impl.ComplementaryFontsRegistry
import com.intellij.openapi.editor.impl.FontInfo
import com.intellij.xdebugger.ui.DebuggerColors
import java.awt.Font
import java.awt.Graphics

abstract class CodeWhispererInlayRenderer(protected val myValue: String) : EditorCustomElementRenderer {
    fun getFontInfo(editor: Editor): FontInfo {
        val colorsScheme = editor.colorsScheme
        val fontPreferences = colorsScheme.fontPreferences
        val attributes = editor.colorsScheme.getAttributes(DebuggerColors.INLINED_VALUES_EXECUTION_LINE)
        val fontStyle = attributes?.fontType ?: Font.PLAIN
        return ComplementaryFontsRegistry.getFontAbleToDisplay(
            'a'.toInt(),
            fontStyle,
            fontPreferences,
            FontInfo.getFontRenderContext(editor.contentComponent)
        )
    }

    fun applyCodeWhispererColorAndFontSettings(editor: Editor, g: Graphics) {
        val attributes = editor.colorsScheme.getAttributes(DebuggerColors.INLINED_VALUES_EXECUTION_LINE) ?: return
        val fgColor = attributes.foregroundColor ?: return
        g.color = fgColor
        val fontInfo = getFontInfo(editor)
        g.font = fontInfo.font
    }
}
