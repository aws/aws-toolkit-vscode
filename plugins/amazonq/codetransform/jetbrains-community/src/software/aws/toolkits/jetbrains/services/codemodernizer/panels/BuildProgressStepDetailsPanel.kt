// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBLabel
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import software.aws.toolkits.jetbrains.services.codemodernizer.model.BuildProgressTimelineStepDetailItem
import software.aws.toolkits.jetbrains.services.codemodernizer.model.BuildStepStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.getTransformationProgressStepsByTransformationStepId
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.PanelHeaderFactory
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.awt.GridLayout
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.DefaultListCellRenderer
import javax.swing.DefaultListModel
import javax.swing.JList
import javax.swing.JPanel

class BuildProgressStepDetailsPanel : JPanel(BorderLayout()) {
    var stepDetailsList: JList<BuildProgressTimelineStepDetailItem> = JList(DefaultListModel<BuildProgressTimelineStepDetailItem>())
    var headerLabel = PanelHeaderFactory().createPanelHeader("Transformation step progress details")
    val scrollPane = ScrollPaneFactory.createScrollPane(stepDetailsList, true)
    var transformationPlanLocal: TransformationPlan? = null
    var currentStepIdRendered: Int = 1

    init {
        add(BorderLayout.NORTH, headerLabel)
        add(BorderLayout.CENTER, scrollPane)
    }

    fun setDefaultUI() {
        val model = stepDetailsList.model as DefaultListModel
        model.removeAllElements()
        stepDetailsList.setCellRenderer(CustomBuildProgressStepDetailCellRenderer())
        stepDetailsList.putClientProperty(AnimatedIcon.ANIMATION_IN_RENDERER_ALLOWED, true)
        scrollPane.border = BorderFactory.createEmptyBorder(
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_TOP,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_LEFT,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_BOTTOM,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_RIGHT,
        )
        repaint()
        revalidate()
    }

    fun setHeaderText(newText: String) {
        val newHeaderLabel = PanelHeaderFactory().createPanelHeader(newText)
        removeAll()
        add(BorderLayout.NORTH, newHeaderLabel)
        add(BorderLayout.CENTER, scrollPane)
    }

    class CustomBuildProgressStepDetailCellRenderer : DefaultListCellRenderer() {
        override fun getListCellRendererComponent(
            list: JList<*>?,
            value: Any?,
            index: Int,
            isSelected: Boolean,
            cellHasFocus: Boolean
        ): Component {
            super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
            val it = value as BuildProgressTimelineStepDetailItem
            val row2TextStr = if (it.description.isNotEmpty()) {
                it.description
            } else {
                if (it.status == BuildStepStatus.DONE) {
                    message("codemodernizer.migration_plan.substeps.description_succeed")
                } else if (it.status == BuildStepStatus.ERROR) {
                    message("codemodernizer.migration_plan.substeps.description_failed")
                } else {
                    it.description
                }
            }
            val row1Text = JBLabel(it.text)
            val row2Text = JBLabel(row2TextStr)

            val rowIcon = when (it.status) {
                BuildStepStatus.DONE, BuildStepStatus.ERROR, BuildStepStatus.WARNING -> JBLabel(CodeModernizerUIConstants.getStepIcon())
                BuildStepStatus.WORKING -> JBLabel(AnimatedIcon.Default.INSTANCE)
            }

            row2Text.apply {
                // We don't show description text until step finished.
                when (it.status) {
                    BuildStepStatus.DONE -> setForeground(CodeModernizerUIConstants.getGreenThemeFontColor())
                    BuildStepStatus.ERROR -> setForeground(CodeModernizerUIConstants.getRedThemeFontColor())
                    BuildStepStatus.WARNING -> setForeground(CodeModernizerUIConstants.getRedThemeFontColor())
                    BuildStepStatus.WORKING -> text = null
                }
            }

            val rowLayoutPanel = JPanel()
            rowLayoutPanel.apply {
                setLayout(GridLayout(2, 1))
                setAlignmentY(Component.CENTER_ALIGNMENT)
                add(row1Text)
                // We only show the text when the status
                // is NOT working. This means success and
                // error states will show text
                if (it.status == BuildStepStatus.WORKING) {
                    // This layout centers the text in the row
                    setLayout(GridLayout(1, 1))
                } else {
                    add(row2Text)
                    setLayout(GridLayout(2, 1))
                }
                repaint()
                revalidate()
            }

            val rowLayoutXPanel = JPanel()
            rowLayoutXPanel.apply {
                BoxLayout(this, BoxLayout.X_AXIS)
                add(rowIcon)
                add(rowLayoutPanel)
                repaint()
                revalidate()
            }

            val cellPanel = JPanel(BorderLayout())
            cellPanel.apply {
                add(BorderLayout.WEST, rowLayoutXPanel)
                repaint()
                revalidate()
            }

            return cellPanel
        }
    }

    fun setStopView(state: TransformationStatus) {
        val newElements = getTransformationProgressStepsByTransformationStepId(currentStepIdRendered, transformationPlanLocal).map {
            // For the currently ongoing step, stop the spinner and show "Job is stopped" description with red color
            if (it.status == BuildStepStatus.WORKING) {
                it.copy(
                    status = BuildStepStatus.ERROR,
                    description = if (state == TransformationStatus.STOPPED) {
                        message("codemodernizer.migration_plan.substeps.description_stopped")
                    } else {
                        message("codemodernizer.migration_plan.substeps.description_failed")
                    }
                )
            } else {
                it
            }
        }
        renderStepDetailElements(newElements)
    }

    fun updateListData(stepId: Int) {
        currentStepIdRendered = stepId
        val newElements = getTransformationProgressStepsByTransformationStepId(stepId, transformationPlanLocal)
        renderStepDetailElements(newElements)
    }

    private fun renderStepDetailElements(elements: List<BuildProgressTimelineStepDetailItem>) {
        val model = stepDetailsList.model as DefaultListModel<BuildProgressTimelineStepDetailItem>
        model.removeAllElements()
        for (element in elements) {
            model.addElement(element)
        }
        stepDetailsList.model = model
        // skip step 0 (contains supplemental info)
        val stepName = transformationPlanLocal?.transformationSteps()?.drop(1)?.get(currentStepIdRendered - 1)?.name().orEmpty()
        setHeaderText("$stepName details")
        revalidate()
        repaint()
    }

    fun setTransformationPlan(newTransformationPlan: TransformationPlan) {
        transformationPlanLocal = newTransformationPlan
        updateListData(currentStepIdRendered)
        revalidate()
        repaint()
    }
}
