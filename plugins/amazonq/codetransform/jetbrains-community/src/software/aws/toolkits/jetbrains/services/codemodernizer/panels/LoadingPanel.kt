// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import com.intellij.openapi.project.Project
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.components.JBLabel
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.BorderFactory
import javax.swing.JButton
import javax.swing.JPanel

class LoadingPanel(private val project: Project) : JPanel(BorderLayout()) {

    val defaultLoadingText = message("codemodernizer.toolwindow.scan_in_progress")
    val progressIndicatorLabel = JBLabel(
        formatLoadingLabelWidth(defaultLoadingText),
        AnimatedIcon.Default(),
        JBLabel.CENTER,
    ).apply {
        border = BorderFactory.createEmptyBorder(7, 7, 7, 7)
    }
    val stopCodeScanButton = JButton(message("codemodernizer.toolwindow.stop_scan")).apply {
        addActionListener {
            CodeModernizerManager.getInstance(project).userInitiatedStopCodeModernization()
        }
    }

    val progressIndicatorPanel = JPanel(GridBagLayout()).apply {
        add(progressIndicatorLabel, GridBagConstraints())
        add(stopCodeScanButton, GridBagConstraints().apply { gridy = 1 })
    }
    private val fixedWidthCSS = "width:420px"

    init {
        reset()
    }

    /**
     * @description Shows the top completion label to the user and empty
     * the main CENTER panel.
     */
    fun showSuccessUI() {
        stopCodeScanButton.isVisible = false
        progressIndicatorLabel.isVisible = false
        progressIndicatorPanel.isVisible = false
        renderDefaultLayout()
    }

    /**
     * @description Shows the top completion label to the user and empty
     * the main CENTER panel.
     */
    fun showFailureUI() {
        stopCodeScanButton.isVisible = false
        progressIndicatorLabel.isVisible = false
        progressIndicatorPanel.isVisible = false
        renderDefaultLayout()
    }

    fun showOnlyLabelUI() {
        stopCodeScanButton.isVisible = false
        progressIndicatorLabel.isVisible = true
        progressIndicatorPanel.isVisible = false
        renderDefaultLayout()
    }

    /**
     * @description Shows in progress indicator indicating that the modernization is in progress
     * in the CENTER layout position. This should hide the NORTH info label and show the
     * CENTER progress label
     */
    fun showInProgressIndicator() {
        progressIndicatorLabel.isVisible = true
        stopCodeScanButton.isVisible = false // we are unable to stop the job at this point for now just disable
        progressIndicatorPanel.isVisible = true
        renderDefaultLayout()
    }

    fun updateProgressIndicatorText(text: String) {
        progressIndicatorLabel.text = formatLoadingLabelWidth(text)
        revalidate()
        repaint()
    }

    /**
     * @description The default behavior is to show the NORTH
     * info label visible and set all other elements to their
     * default states.
     */
    fun setDefaultUI() {
        stopCodeScanButton.isVisible = false
        progressIndicatorLabel.isVisible = true
        progressIndicatorPanel.isVisible = true
        renderDefaultLayout()
    }

    fun renderDefaultLayout() {
        removeAll()
        add(BorderLayout.CENTER, progressIndicatorPanel)
        revalidate()
        repaint()
    }

    fun reset() {
        progressIndicatorLabel.text = formatLoadingLabelWidth(defaultLoadingText)
        add(BorderLayout.CENTER, progressIndicatorPanel)
        showOnlyLabelUI()
    }

    private fun formatLoadingLabelWidth(inputText: String): String = "<html><div style='$fixedWidthCSS;'>$inputText</div></html>"
}
