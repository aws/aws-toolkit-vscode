// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.ui.VerticalFlowLayout
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.NonOpaquePanel
import com.intellij.util.ui.UIUtil
import java.awt.FlowLayout
import java.awt.event.ActionEvent
import javax.swing.JButton
import javax.swing.SwingConstants

class CenteredInfoPanel : NonOpaquePanel(VerticalFlowLayout(VerticalFlowLayout.MIDDLE)) {
    fun addLine(message: String, isError: Boolean = false) = apply {
        val line = JBLabel()
        line.isOpaque = false
        line.text = "<html><center>$message</center></html>"
        line.horizontalAlignment = SwingConstants.CENTER

        if (isError) {
            line.foreground = UIUtil.getErrorForeground()
        }

        add(line)
    }

    fun addAction(message: String, handler: (ActionEvent) -> Unit) = apply {
        val action = ActionLink(message, handler)
        action.horizontalAlignment = SwingConstants.CENTER

        add(action)
    }

    fun addDefaultActionButton(message: String, handler: (ActionEvent) -> Unit) = apply {
        add(
            NonOpaquePanel(FlowLayout()).apply {
                add(
                    JButton(message).apply {
                        isOpaque = false
                        putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
                        addActionListener(handler)
                    }
                )
            }
        )
    }
}
