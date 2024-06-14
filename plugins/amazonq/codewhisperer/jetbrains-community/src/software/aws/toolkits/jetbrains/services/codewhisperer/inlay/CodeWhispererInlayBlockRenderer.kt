// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.inlay

import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.markup.TextAttributes
import java.awt.Graphics
import java.awt.Rectangle
import kotlin.math.max

class CodeWhispererInlayBlockRenderer(myValue: String) : CodeWhispererInlayRenderer(myValue) {
    private val myLines: List<String>
    init {
        myLines = myValue.split("\n")
    }

    override fun calcWidthInPixels(inlay: Inlay<*>): Int {
        val fontMetrics = getFontInfo(inlay.editor).fontMetrics()
        var maxWidthForSingleLine = fontMetrics.stringWidth(myLines[0])
        for (i in myLines.indices) {
            maxWidthForSingleLine = max(maxWidthForSingleLine, fontMetrics.stringWidth(myLines[i]))
        }
        return maxWidthForSingleLine
    }

    override fun calcHeightInPixels(inlay: Inlay<*>): Int = myLines.size * inlay.editor.lineHeight

    override fun paint(inlay: Inlay<*>, g: Graphics, targetRegion: Rectangle, textAttributes: TextAttributes) {
        applyCodeWhispererColorAndFontSettings(inlay.editor, g)
        for (i in myLines.indices) {
            g.drawString(myLines[i], 0, targetRegion.y + i * inlay.editor.lineHeight + inlay.editor.ascent)
        }
    }
}
