// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.ui.JBColor
import com.intellij.util.ui.JBInsets
import java.awt.Component
import java.awt.Graphics
import javax.swing.border.EmptyBorder

/**
 * Border that draws a line at the bottom of the panel, ignoring all insets. Meaning it will render past the components inside the panel.
 */
class BottomLineBorder(private val color: JBColor, insets: JBInsets) : EmptyBorder(insets) {
    override fun paintBorder(c: Component?, g: Graphics, x: Int, y: Int, width: Int, height: Int) {
        g.color = color
        g.drawLine(x, y + height - 1, x + width, y + height - 1)
    }
}
