// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.ui.components.ActionLink
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addVerticalGlue
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.horizontalPanelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.inlineLabelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererLicenseInfoManager
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererConfigurable
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.TOOLWINDOW_BACKGROUND
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.TOOLWINDOW_CODE
import software.aws.toolkits.resources.message
import java.awt.Font
import java.awt.GridBagLayout
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

class CodeWhispererCodeReferenceComponents(private val project: Project) {
    private val settingsLabelPrefixText = JLabel().apply {
        text = message("codewhisperer.toolwindow.settings.prefix")
    }.asCodeReferencePanelFont()

    private val settingsLabelLink = ActionLink().apply {
        text = message("codewhisperer.toolwindow.settings")
        addActionListener {
            ShowSettingsUtil.getInstance().showSettingsDialog(project, CodeWhispererConfigurable::class.java)
        }
    }.asCodeReferencePanelFont()

    private val settingsPanel = JPanel(GridBagLayout()).apply {
        background = TOOLWINDOW_BACKGROUND
        border = BorderFactory.createEmptyBorder(0, 0, 17, 0)
        add(settingsLabelPrefixText, inlineLabelConstraints)
        add(settingsLabelLink, inlineLabelConstraints)
        add(JLabel("."), inlineLabelConstraints)
        addHorizontalGlue()
    }
    val contentPanel = JPanel(GridBagLayout()).apply {
        background = TOOLWINDOW_BACKGROUND
        border = BorderFactory.createEmptyBorder(7, 14, 0, 0)
        add(settingsPanel, horizontalPanelConstraints)
        addVerticalGlue()
    }

    private val codeReferenceTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")
    private val acceptRecommendationPrefixText
        get() = JLabel().apply {
            text = message("codewhisperer.toolwindow.entry.prefix", LocalTime.now().format(codeReferenceTimeFormatter))
        }.asCodeReferencePanelFont()

    init {
        repaint(project)

        // set the reference panel text different for SSO users vs AWS Builder ID / Accless users
        project.messageBus.connect().subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    repaint(project)
                }
            }
        )
    }

    // TODO: figure out how to have a different view for SSO user in a cleaner way, maybe have 2 sets of components stored in [ReferenceManager]?
    private fun repaint(project: Project) {
        val loginType = CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project)
        settingsLabelPrefixText as JLabel
        settingsLabelLink as ActionLink
        if (loginType == CodeWhispererLoginType.SSO) {
            settingsLabelPrefixText.text = message("codewhisperer.toolwindow.settings.prefix_sso")
            settingsLabelLink.isVisible = false
        } else {
            settingsLabelPrefixText.text = message("codewhisperer.toolwindow.settings.prefix")
            settingsLabelLink.isVisible = true
        }
    }

    private fun licenseNameLink(licenseName: String) = ActionLink(licenseName) {
        BrowserUtil.browse(CodeWhispererLicenseInfoManager.getInstance().getLicenseLink(licenseName))
    }.asCodeReferencePanelFont()

    private fun repoNameLink(repo: String, url: String) = ActionLink(repo) {
        BrowserUtil.browse(url)
    }.asCodeReferencePanelFont()

    private fun acceptRecommendationSuffixText(path: String?, line: String) = JLabel().apply {
        val choice = if (path != null) 1 else 0
        text = message("codewhisperer.toolwindow.entry.suffix", path ?: "", choice, line)
    }.asCodeReferencePanelFont()

    fun codeReferenceRecordPanel(ref: Reference, relativePath: String?, lineNums: String) = JPanel(GridBagLayout()).apply {
        background = EditorColorsManager.getInstance().globalScheme.defaultBackground
        border = BorderFactory.createEmptyBorder(5, 0, 0, 0)
        add(acceptRecommendationPrefixText, inlineLabelConstraints)

        // if url to source package/repo is missing, the UX remains the same as we have for now
        // if url to source package/repo is present, the url pointing to the source will be present and remove the hyperlink to SPDX
        if (ref.url().isNullOrEmpty()) {
            add(
                licenseNameLink(ref.licenseName()).apply {
                    font = font.deriveFont(Font.ITALIC + Font.BOLD)
                },
                inlineLabelConstraints
            )
            add(JLabel(" from ").asCodeReferencePanelFont(), inlineLabelConstraints)
            add(JLabel(ref.repository()), inlineLabelConstraints)
        } else {
            add(
                JLabel(ref.licenseName()).apply {
                    font = font.deriveFont(Font.ITALIC + Font.BOLD)
                },
                inlineLabelConstraints
            )
            add(JLabel(" from ").asCodeReferencePanelFont(), inlineLabelConstraints)
            add(repoNameLink(ref.repository(), ref.url()), inlineLabelConstraints)
        }

        add(acceptRecommendationSuffixText(relativePath, lineNums), inlineLabelConstraints)
        addHorizontalGlue()
    }

    fun codeContentLine(line: String) = JLabel(line).apply {
        foreground = TOOLWINDOW_CODE
    }.asCodeReferencePanelFont()

    fun codeContentPanel(line: String) = JPanel(GridBagLayout()).apply {
        background = EditorColorsManager.getInstance().globalScheme.defaultBackground
        if (line == "") {
            add(codeContentLine(" "), inlineLabelConstraints)
        } else {
            add(codeContentLine(line), inlineLabelConstraints)
        }
        addHorizontalGlue()
    }

    private fun JComponent.asCodeReferencePanelFont(): JComponent {
        font = Font("JetBrains mono", font.style, font.size)
        return this
    }
}
