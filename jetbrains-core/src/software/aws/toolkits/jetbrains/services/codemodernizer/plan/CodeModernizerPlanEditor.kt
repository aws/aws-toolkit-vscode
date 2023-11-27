// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.plan

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.components.JBScrollPane
import icons.AwsIcons
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStep
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import software.aws.toolkits.jetbrains.services.codemodernizer.plan.CodeModernizerPlanEditorProvider.Companion.JAVA_VERSION
import software.aws.toolkits.jetbrains.services.codemodernizer.plan.CodeModernizerPlanEditorProvider.Companion.MIGRATION_PLAN_KEY
import software.aws.toolkits.jetbrains.services.codemodernizer.plan.CodeModernizerPlanEditorProvider.Companion.MODULE_NAME_KEY
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.resources.message
import java.awt.FlowLayout
import java.awt.GridBagLayout
import java.awt.GridLayout
import java.awt.Panel
import java.beans.PropertyChangeListener
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JEditorPane
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.event.HyperlinkEvent

class CodeModernizerPlanEditor(val project: Project, val virtualFile: VirtualFile) : UserDataHolderBase(), FileEditor {
    val plan = virtualFile.getUserData(MIGRATION_PLAN_KEY) ?: throw RuntimeException("Migration plan not found")
    val module = virtualFile.getUserData(MODULE_NAME_KEY) ?: CodeModernizerUIConstants.EMPTY_SPACE_STRING
    val javaVersion = virtualFile.getUserData(JAVA_VERSION).orEmpty()
    private val contentPanel = JPanel(GridBagLayout()).apply {
        add(
            JPanel(GridBagLayout()).apply {
                add(
                    title(message("codemodernizer.migration_plan.header.title")),
                    CodeModernizerUIConstants.transformationPlanPlaneConstraint
                )
                add(transformationPlanInfo(plan, module), CodeModernizerUIConstants.transformationPlanPlaneConstraint)
                add(transformationPlanPanel(plan), CodeModernizerUIConstants.transformationPlanPlaneConstraint)
            },
            CodeModernizerUIConstants.transformationPlanPlaneConstraint
        )
        add(Box.createVerticalGlue(), CodeModernizerUIConstants.FILLER_CONSTRAINT)
        border = planGaps()
    }

    private val rootPanel = JBScrollPane(contentPanel).apply {
        horizontalScrollBarPolicy = JBScrollPane.HORIZONTAL_SCROLLBAR_NEVER
    }

    override fun dispose() {}
    override fun getComponent() = rootPanel
    override fun getPreferredFocusedComponent() = null
    override fun getName() = "CodeModernizerTransformationPlan"
    override fun getFile(): VirtualFile = virtualFile
    override fun setState(state: FileEditorState) {}
    override fun isModified() = false
    override fun isValid() = true
    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}
    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    private fun title(text: String) = Panel().apply {
        layout = FlowLayout(FlowLayout.LEFT)
        val iconLabel = JLabel(AwsIcons.Logos.AWS_Q_GRADIENT)
        val textLabel = JLabel(text).apply {
            font = font.deriveFont(
                CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                CodeModernizerUIConstants.PLAN_CONSTRAINTS.TITLE_FONT_SIZE
            )
        }
        add(iconLabel)
        add(textLabel)
    }

    private fun transformationPlanPanel(plan: TransformationPlan) = JPanel(GridBagLayout()).apply {
        val stepsIntroTitle = JLabel(message("codemodernizer.migration_plan.body.steps_intro_title")).apply {
            font = font.deriveFont(
                CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                CodeModernizerUIConstants.PLAN_CONSTRAINTS.TRANSFORMATION_STEP_TITLE_FONT_SIZE
            )
            border = CodeModernizerUIConstants.STEP_INTRO_TITLE_BORDER
        }
        val stepsIntro = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            add(stepsIntroTitle, CodeWhispererLayoutConfig.inlineLabelConstraints)
            border = CodeModernizerUIConstants.STEP_INTRO_BORDER
        }
        add(stepsIntro, CodeModernizerUIConstants.transformationPlanPlaneConstraint)
        plan.transformationSteps().forEachIndexed { step, i ->
            val row = transformationStepPanel(i)
            add(row, CodeModernizerUIConstants.transformationPlanPlaneConstraint)
        }
        border = CodeModernizerUIConstants.TRANSFORMATION_PLAN_PANEL_BORDER
    }

    private fun transformationStepPanel(step: TransformationStep): JPanel {
        val nameLabel = JLabel(step.name()).apply {
            font = font.deriveFont(
                CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                CodeModernizerUIConstants.PLAN_CONSTRAINTS.TRANSFORMATION_STEP_TITLE_FONT_SIZE
            )
            border = nameBoarder()
        }
        val descriptionLabel =
            JLabel(message("codemodernizer.migration_plan.body.steps_step_description", step.description())).apply {
                font = font.deriveFont(CodeModernizerUIConstants.PLAN_CONSTRAINTS.STEP_FONT_SIZE)
                border = descriptionBoarder()
            }
        val transformationStepPanel = JPanel()
        transformationStepPanel.add(nameLabel)
        transformationStepPanel.add(descriptionLabel)

        return transformationStepPanel.apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = CodeModernizerUIConstants.TRANSFORMATION_STEP_PANEL_COMPOUND_BORDER
        }
    }

    fun transformationPlanInfo(plan: TransformationPlan, module: String) = JPanel().apply {
        layout = GridLayout(1, 2)
        val stepsInfo = JPanel().apply {
            layout = FlowLayout(FlowLayout.LEFT)
            add(JLabel(AllIcons.Actions.ListFiles))
            add(JLabel(message("codemodernizer.migration_plan.body.info", plan.transformationSteps().size)))
            addHorizontalGlue()
            border = CodeModernizerUIConstants.TRANSFORMATION_STEPS_INFO_BORDER
            font = font.deriveFont(CodeModernizerUIConstants.PLAN_CONSTRAINTS.STEP_FONT_SIZE)
        }
        val awsqInfo = JPanel().apply {
            layout = GridLayout()
            val qChat = JEditorPane("text/html", message("codemodernizer.migration_plan.header.awsq", javaVersion, module))
            qChat.isEditable = false
            qChat.isOpaque = false
            qChat.addHyperlinkListener {
                if (it.eventType.equals(HyperlinkEvent.EventType.ACTIVATED)) {
                    ToolWindowManager.getInstance(project).getToolWindow(AmazonQToolWindowFactory.WINDOW_ID)
                        ?.activate(null, true)
                }
            }
            add(qChat)
            border = CodeModernizerUIConstants.TRANSFORMATION_STEPS_INFO_AWSQ_BORDER
            font = font.deriveFont(CodeModernizerUIConstants.PLAN_CONSTRAINTS.STEP_FONT_SIZE)
        }
        add(awsqInfo)
        add(stepsInfo)
        border = CodeModernizerUIConstants.TRANSOFORMATION_PLAN_INFO_BORDER
    }

    fun planGaps() = BorderFactory.createEmptyBorder(
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.PLAN_PADDING_TOP,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.PLAN_PADDING_LEFT,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.PLAN_PADDING_BOTTOM,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.PLAN_PADDING_RIGHT
    )

    fun nameBoarder() = BorderFactory.createEmptyBorder(
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.NAME_PADDING_TOP,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.NAME_PADDING_LEFT,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.NAME_PADDING_BOTTOM,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.NAME_PADDING_RIGHT
    )

    fun descriptionBoarder() = BorderFactory.createEmptyBorder(
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.DESCRP_PADDING_TOP,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.DESCRP_PADDING_LEFT,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.DESCRP_PADDING_BOTTOM,
        CodeModernizerUIConstants.PLAN_CONSTRAINTS.DESCRP_PADDING_RIGHT
    )
}
