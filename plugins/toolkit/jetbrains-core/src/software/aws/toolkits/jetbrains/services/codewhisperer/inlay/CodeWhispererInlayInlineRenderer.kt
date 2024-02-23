// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.inlay

import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.markup.TextAttributes
import java.awt.Graphics
import java.awt.Rectangle

class CodeWhispererInlayInlineRenderer(myValue: String) : CodeWhispererInlayRenderer(myValue) {
    override fun calcWidthInPixels(inlay: Inlay<*>): Int {
        val fontInfo = getFontInfo(inlay.editor)
        return if (myValue.isEmpty()) {
            1
        } else {
            fontInfo.fontMetrics().stringWidth(myValue)
        }
    }

    override fun paint(inlay: Inlay<*>, g: Graphics, targetRegion: Rectangle, textAttributes: TextAttributes) {
        applyCodeWhispererColorAndFontSettings(inlay.editor, g)
        g.drawString(myValue, targetRegion.x, targetRegion.y + inlay.editor.ascent)
    }
}
