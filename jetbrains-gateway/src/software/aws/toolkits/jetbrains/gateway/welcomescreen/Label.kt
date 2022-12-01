// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.ui.RoundedLineBorder
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.speedSearch.SpeedSearchUtil
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Insets
import javax.swing.BorderFactory
import javax.swing.JComponent

class Label(private val text: String = "", private val providesSpeedSearch: Boolean = true) : SimpleColoredComponent(), WorkspaceSpeedSearchProvider {
    init {
        append(text)
        isOpaque = false
        ipad = JBInsets.create(0, 0)
        myBorder = BorderFactory.createEmptyBorder()
        border = object : RoundedLineBorder(JBUI.CurrentTheme.Button.buttonOutlineColorStart(false), 15) {
            private val borderInsets = JBUI.insets(1, 6, 1, 6)
            override fun getBorderInsets(c: Component?): Insets = borderInsets
            override fun getBorderInsets(c: Component?, insets: Insets?): Insets = borderInsets
        }
        font = JBUI.Fonts.smallFont()
        foreground = UIUtil.getInactiveTextColor()
    }

    override fun highlight(speedSearchEnabledComponent: JComponent) {
        if (!providesSpeedSearch) {
            return
        }

        clear()
        append(text)
        SpeedSearchUtil.applySpeedSearchHighlighting(speedSearchEnabledComponent, this, true, false)
    }

    override fun getElementText(): String? =
        if (providesSpeedSearch) {
            text
        } else {
            null
        }
}
