// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.serviceContainer.AlreadyDisposedException
import com.intellij.ui.JBColor
import com.intellij.ui.border.CustomLineBorder
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.JBUI
import icons.AwsIcons
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.jetbrains.ui.feedback.CodeTransformFeedbackDialog
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.time.Duration
import javax.swing.BorderFactory
import javax.swing.Icon
import javax.swing.JPanel
import kotlin.time.Duration.Companion.seconds
import kotlin.time.toKotlinDuration

class CodeModernizerBanner(val project: Project) : JPanel(BorderLayout()) {
    private val currentlyShownOptions = mutableSetOf<ActionLink>()

    private val infoLabelPrefix = JBLabel(message("codemodernizer.toolwindow.banner.run_scan_info"), JBLabel.LEFT).apply {
        icon = AllIcons.General.BalloonInformation
    }

    private val infoLabelRunningTime = JBLabel().apply {
        foreground = JBColor.GRAY
        border = BorderFactory.createEmptyBorder(0, 5, 0, 0)
    }

    private val infoPanel = JPanel(GridBagLayout())

    val showDiffAction = ActionLink(message("codemodernizer.toolwindow.banner.action.diff")) {
        CodeModernizerManager.getInstance(project).showDiff()
    }
    val showPlanAction = ActionLink(message("codemodernizer.toolwindow.banner.action.plan")) {
        CodeModernizerManager.getInstance(project).showTransformationPlan()
    }
    val showSummaryAction = ActionLink(message("codemodernizer.toolwindow.banner.action.summary")) {
        CodeModernizerManager.getInstance(project).showTransformationSummary()
    }

    private val feedbackPanel = JPanel(GridBagLayout()).apply {
        add(
            JBLabel(AwsIcons.Misc.SMILE_GREY).apply {
                border = BorderFactory.createEmptyBorder(0, 5, 0, 5)
            },
            CodeWhispererLayoutConfig.inlineLabelConstraints
        )
        add(
            ActionLink(message("codemodernizer.toolwindow.banner.action.feedback")) {
                CodeTransformFeedbackDialog(project).showAndGet()
            },
            CodeWhispererLayoutConfig.inlineLabelConstraints
        )
        addHorizontalGlue()
    }

    private fun buildContent() {
        infoPanel.apply {
            layout = GridBagLayout()
            add(infoLabelPrefix, CodeWhispererLayoutConfig.inlineLabelConstraints)
            currentlyShownOptions.forEach {
                add(
                    it,
                    GridBagConstraints().apply {
                        anchor = GridBagConstraints.WEST
                        insets = JBInsets.create(0, 10)
                    }
                )
            }
            add(infoLabelRunningTime, CodeWhispererLayoutConfig.kebabMenuConstraints)
        }
        infoPanel.revalidate()
        infoPanel.repaint()
    }

    init {
        border = BorderFactory.createCompoundBorder(
            CustomLineBorder(JBUI.insetsBottom(1)),
            BorderFactory.createEmptyBorder(7, 11, 8, 11),
        )
        add(infoPanel, BorderLayout.LINE_START)
        add(feedbackPanel, BorderLayout.LINE_END)
    }

    fun updateActions(vararg actions: ActionLink) {
        currentlyShownOptions.addAll(actions)
        buildContent()
    }

    fun updateContent(text: String, icon: Icon = AllIcons.General.BalloonInformation) {
        infoPanel.isVisible = true
        infoLabelPrefix.icon = icon
        infoLabelPrefix.text = text
        infoLabelPrefix.repaint()
        infoLabelPrefix.isVisible = true
        infoPanel.removeAll()
        buildContent()
    }

    fun updateRunningTime(runTime: Duration?) {
        try {
            if (runTime == null) {
                infoLabelRunningTime.text = ""
            } else {
                val timeTaken = runTime.toKotlinDuration().inWholeSeconds.seconds.toString()
                infoLabelRunningTime.text = message(
                    "codemodernizer.toolwindow.transformation.progress.running_time",
                    timeTaken
                )
            }
        } catch (exception: AlreadyDisposedException) {
            LOG.warn { "Disposed when about to create the loading panel" }
            return
        }
    }

    fun clearActions() {
        currentlyShownOptions.clear()
        buildContent()
    }

    companion object {
        private val LOG = getLogger<CodeModernizerBanner>()
    }
}
