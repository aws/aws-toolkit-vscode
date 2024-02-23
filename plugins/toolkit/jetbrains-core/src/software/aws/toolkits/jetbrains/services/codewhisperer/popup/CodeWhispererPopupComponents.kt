// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.popup

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.impl.ActionButton
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.components.ActionLink
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererProvideFeedbackAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererShowSettingsAction
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.horizontalPanelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.inlineLabelConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.kebabMenuConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.middleButtonConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.navigationButtonConstraints
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererLicenseInfoManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_BUTTON_BORDER
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_DIM_HEX
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_HOVER
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_PANEL_SEPARATOR
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_REF_INFO
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.POPUP_REF_NOTICE_HEX
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.POPUP_BUTTON_TEXT_SIZE
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.POPUP_INFO_TEXT_SIZE
import software.aws.toolkits.resources.message
import java.awt.GridBagLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel

class CodeWhispererPopupComponents {
    val prevButton = createNavigationButton(
        message("codewhisperer.popup.button.prev", POPUP_DIM_HEX)
    )
    val nextButton = createNavigationButton(
        message("codewhisperer.popup.button.next", POPUP_DIM_HEX)
    ).apply {
        preferredSize = prevButton.preferredSize
    }
    val acceptButton = createNavigationButton(
        message("codewhisperer.popup.button.accept", POPUP_DIM_HEX)
    )
    val buttonsPanel = CodeWhispererPopupInfoPanel {
        border = BorderFactory.createCompoundBorder(
            border,
            BorderFactory.createEmptyBorder(3, 0, 3, 0)
        )
        add(acceptButton, navigationButtonConstraints)
        add(prevButton, middleButtonConstraints)
        add(nextButton, navigationButtonConstraints)
    }
    val recommendationInfoLabel = JLabel().apply {
        font = font.deriveFont(POPUP_INFO_TEXT_SIZE)
    }
    private val kebabMenuAction = DefaultActionGroup().apply {
        isPopup = true
        add(CodeWhispererProvideFeedbackAction())
        add(CodeWhispererLearnMoreAction())
        add(CodeWhispererShowSettingsAction())
    }
    private val kebabMenuPresentation = Presentation().apply {
        icon = AllIcons.Actions.More
        putClientProperty(ActionButton.HIDE_DROPDOWN_ICON, true)
    }
    private val kebabMenu = ActionButton(
        kebabMenuAction,
        kebabMenuPresentation,
        ActionPlaces.EDITOR_POPUP,
        ActionToolbar.NAVBAR_MINIMUM_BUTTON_SIZE
    )
    private val recommendationInfoPanel = CodeWhispererPopupInfoPanel {
        add(recommendationInfoLabel, inlineLabelConstraints)
        addHorizontalGlue()
        add(kebabMenu, kebabMenuConstraints)
    }
    val importLabel = JLabel().apply {
        font = font.deriveFont(POPUP_INFO_TEXT_SIZE)
    }

    val importPanel = CodeWhispererPopupInfoPanel {
        add(importLabel, inlineLabelConstraints)
        addHorizontalGlue()
    }

    val licenseCodeLabelPrefixText = JLabel().apply {
        text = message("codewhisperer.popup.reference.license_info.prefix", POPUP_REF_NOTICE_HEX)
        foreground = POPUP_REF_INFO
    }

    val codeReferencePanelLink = ActionLink(message("codewhisperer.popup.reference.panel_link"))
    val licenseCodePanel = JPanel(GridBagLayout()).apply {
        border = BorderFactory.createEmptyBorder(0, 0, 3, 0)
        add(licenseCodeLabelPrefixText, inlineLabelConstraints)
        add(ActionLink(), inlineLabelConstraints)
        add(codeReferencePanelLink, inlineLabelConstraints)
        addHorizontalGlue()
    }

    fun licenseLink(license: String) = ActionLink(license) {
        BrowserUtil.browse(CodeWhispererLicenseInfoManager.getInstance().getLicenseLink(license))
    }

    val codeReferencePanel = CodeWhispererPopupInfoPanel {
        add(licenseCodePanel, horizontalPanelConstraints)
    }
    val panel = JPanel(GridBagLayout()).apply {
        add(buttonsPanel, horizontalPanelConstraints)
        add(recommendationInfoPanel, horizontalPanelConstraints)
        add(importPanel, horizontalPanelConstraints)
        add(codeReferencePanel, horizontalPanelConstraints)
    }

    private fun createNavigationButton(buttonText: String) = JButton(buttonText).apply {
        font = font.deriveFont(POPUP_BUTTON_TEXT_SIZE)
        border = IdeBorderFactory.createRoundedBorder().apply {
            setColor(POPUP_BUTTON_BORDER)
        }
        isContentAreaFilled = false

        addMouseListener(object : MouseAdapter() {
            override fun mouseEntered(e: MouseEvent?) {
                foreground = POPUP_HOVER
            }

            override fun mouseClicked(e: MouseEvent?) {
                foreground = POPUP_HOVER
            }

            override fun mouseExited(e: MouseEvent?) {
                foreground = UIUtil.getLabelForeground()
            }
        })
    }

    class CodeWhispererPopupInfoPanel(function: CodeWhispererPopupInfoPanel.() -> Unit) : JPanel(GridBagLayout()) {
        init {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(1, 0, 0, 0, POPUP_PANEL_SEPARATOR),
                BorderFactory.createEmptyBorder(2, 5, 2, 5)
            )
            function()
        }
    }
}
