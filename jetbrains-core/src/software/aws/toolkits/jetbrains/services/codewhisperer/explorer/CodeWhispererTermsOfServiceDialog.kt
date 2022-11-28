// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.BrowserHyperlinkListener
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.layout.panel
import com.intellij.util.ResourceUtil
import software.aws.toolkits.resources.message
import java.awt.Dimension
import java.awt.Font
import java.awt.Insets
import javax.swing.JComponent
import javax.swing.JEditorPane
import javax.swing.ScrollPaneConstants
import javax.swing.event.HyperlinkEvent

class CodeWhispererTermsOfServiceDialog(project: Project?) : DialogWrapper(project) {

    private val heading = JBLabel().apply {
        text = message("codewhisperer.explorer.tos.heading")
        font = Font("Default", font.style, 24)
    }
    private val tosURL = ResourceUtil.getResource(CodeWhispererTermsOfServiceDialog::class.java, "codewhisperer", "tos_beta.html")
    private val tosDetail = JEditorPane().apply {
        margin = Insets(0, 20, 20, 20)
        isEditable = false
        enableInputMethods(true)
        isEnabled = true
        contentType = "text/html"
        page = tosURL
        addHyperlinkListener { e ->
            if (e.eventType === HyperlinkEvent.EventType.ACTIVATED) {
                BrowserHyperlinkListener.INSTANCE.hyperlinkUpdate(e)
            }
        }
    }

    private val scrollPane = JBScrollPane(tosDetail).apply {
        verticalScrollBarPolicy = ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED
        horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        preferredSize = Dimension(625, 350)
    }
    private val component by lazy {
        setOKButtonText(message("codewhisperer.explorer.tos.ok_button"))
        setCancelButtonText(message("general.reject"))
        panel {
            row {
                heading(grow)
            }
            row {
                scrollPane(grow)
            }
        }
    }
    init {
        super.init()
        title = message("codewhisperer.explorer.tos.title")
    }

    override fun createCenterPanel(): JComponent = component
}
