// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.ui.components

import com.intellij.ui.components.JBLabel
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import java.awt.Font
import javax.swing.BorderFactory

class PanelHeaderFactory {
    fun createPanelHeader(headerText: String): JBLabel {
        var headerElement = JBLabel(headerText).apply {
            // Set padding
            border = BorderFactory.createEmptyBorder(
                CodeModernizerUIConstants.HEADER.PADDING_TOP,
                CodeModernizerUIConstants.HEADER.PADDING_LEFT,
                CodeModernizerUIConstants.HEADER.PADDING_BOTTOM,
                CodeModernizerUIConstants.HEADER.PADDING_RIGHT
            )
            // Set font size
            val newFont = font.deriveFont(CodeModernizerUIConstants.HEADER.FONT_SIZE)
            font = newFont

            // Make font bold
            val boldFont = Font(font.fontName, Font.BOLD, font.size)
            font = boldFont
        }

        return headerElement
    }
}
