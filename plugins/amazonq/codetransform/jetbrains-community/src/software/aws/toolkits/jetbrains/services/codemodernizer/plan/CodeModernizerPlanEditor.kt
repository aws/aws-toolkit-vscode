// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.plan

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBScrollPane
import icons.AwsIcons
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStep
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import software.aws.toolkits.jetbrains.services.codemodernizer.model.PlanTable
import software.aws.toolkits.jetbrains.services.codemodernizer.plan.CodeModernizerPlanEditorProvider.Companion.MIGRATION_PLAN_KEY
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getTableMapping
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.FlowLayout
import java.awt.Font
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.GridLayout
import java.awt.Panel
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.beans.PropertyChangeListener
import java.util.Vector
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.Icon
import javax.swing.JEditorPane
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTable
import javax.swing.JTextArea
import javax.swing.SwingUtilities
import javax.swing.event.HyperlinkEvent
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.DefaultTableModel

class CodeModernizerPlanEditor(val project: Project, val virtualFile: VirtualFile) : UserDataHolderBase(), FileEditor {
    val plan = virtualFile.getUserData(MIGRATION_PLAN_KEY) ?: throw RuntimeException("Migration plan not found")
    val tableMapping =
        if (!plan.transformationSteps()[0].progressUpdates().isNullOrEmpty()) {
            getTableMapping(plan.transformationSteps()[0].progressUpdates())
        } else {
            throw RuntimeException("GetPlan response missing step 0 progress updates with table data")
        }
    private val mapper = jacksonObjectMapper()

    // to-do: convert to UI DSL
    private val contentPanel =
        JPanel(GridBagLayout()).apply {
            add(
                JPanel(GridBagLayout()).apply {
                    add(
                        title(message("codemodernizer.migration_plan.header.title")),
                        CodeModernizerUIConstants.transformationPlanPlaneConstraint,
                    )
                    // key "0" reserved for job statistics table
                    // comes from "name" field of each progressUpdate in step zero of plan
                    if ("0" in tableMapping) {
                        add(
                            transformationPlanInfo(mapper.readValue(tableMapping["0"], PlanTable::class.java)),
                            CodeModernizerUIConstants.transformationPlanPlaneConstraint,
                        )
                    }
                    add(transformationPlanPanel(plan), CodeModernizerUIConstants.transformationPlanPlaneConstraint)
                    // key "-1" reserved for appendix table
                    if ("-1" in tableMapping) {
                        add(
                            transformationPlanAppendix(mapper.readValue(tableMapping["-1"], PlanTable::class.java)),
                            CodeModernizerUIConstants.transformationPlanPlaneConstraint,
                        )
                    }
                },
                CodeModernizerUIConstants.transformationPlanPlaneConstraint,
            )
            add(Box.createVerticalGlue(), CodeModernizerUIConstants.FILLER_CONSTRAINT)
            border = CodeModernizerUIConstants.PLAN_BORDER
        }

    private val rootPanel =
        JBScrollPane(contentPanel).apply {
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

    private fun title(text: String) =
        Panel().apply {
            layout = FlowLayout(FlowLayout.LEFT)
            val iconLabel = JLabel(AwsIcons.Logos.AWS_Q_GRADIENT)
            val textLabel =
                JLabel(text).apply {
                    font =
                        font.deriveFont(
                            CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                            CodeModernizerUIConstants.PLAN_CONSTRAINTS.TITLE_FONT_SIZE,
                        )
                }
            add(iconLabel)
            add(textLabel)
        }

    private fun createScrollPanel(): JPanel {
        val arrowIcon = if (JBColor.isBright()) AwsIcons.CodeTransform.PLAN_ARROW_LIGHT else AwsIcons.CodeTransform.PLAN_ARROW_DARK
        val scrollPanel = JPanel(BorderLayout())
        val scrollIcon = JLabel(arrowIcon)
        val scrollPane =
            JEditorPane("text/html", message("codemodernizer.migration_plan.body.steps_scroll_top")).apply {
                addHyperlinkListener { he ->
                    if (he.eventType == HyperlinkEvent.EventType.ACTIVATED) {
                        SwingUtilities.invokeLater { rootPanel.verticalScrollBar.setValue(0) }
                    }
                }
                isEditable = false
                isOpaque = false
                alignmentX = Component.RIGHT_ALIGNMENT
            }
        scrollPanel.add(scrollPane, BorderLayout.CENTER)
        scrollPanel.add(scrollIcon, BorderLayout.EAST)
        return scrollPanel
    }

    private fun getFormattedString(actionString: String) =
        when (actionString) {
            "linesOfCode" -> message("codemodernizer.migration_plan.body.info.lines_of_code_message")
            "plannedDependencyChanges" -> message("codemodernizer.migration_plan.body.info.dependency_replace_message")
            "plannedDeprecatedApiChanges" -> message("codemodernizer.migration_plan.body.info.deprecated_code_message")
            "plannedFileChanges" -> message("codemodernizer.migration_plan.body.info.files_changed_message")
            "dependencyName" -> message("codemodernizer.migration_plan.body.info.dependency_name_column")
            "action" -> message("codemodernizer.migration_plan.body.info.action_column")
            "currentVersion" -> message("codemodernizer.migration_plan.body.info.current_version_column")
            "targetVersion" -> message("codemodernizer.migration_plan.body.info.target_version_column")
            "relativePath" -> message("codemodernizer.migration_plan.body.info.file_column")
            "apiFullyQualifiedName" -> message("codemodernizer.migration_plan.body.info.deprecated_code_column")
            "numChangedFiles" -> message("codemodernizer.migration_plan.body.info.changed_files_column")
            else -> actionString
        }

    // use parsed MD string stored in step 0 progress updates from GetPlan response to create table
    private fun createTable(stepTable: PlanTable): JTable {
        val columnsVector = Vector(stepTable.columns)
        columnsVector.forEachIndexed { index, columnName ->
            columnsVector[index] = getFormattedString(columnName)
        }
        val data = Vector<Vector<String>>()
        stepTable.rows.forEach { row ->
            val rowData = Vector<String>()
            stepTable.columns.forEach { col ->
                rowData.add(row.getValueForColumn(col))
            }
            data.add(rowData)
        }
        val model =
            object : DefaultTableModel(data, columnsVector) {
                override fun isCellEditable(
                    row: Int,
                    column: Int,
                ) = false
            }
        // left-align and bold the column names
        val cellRenderer =
            object : DefaultTableCellRenderer() {
                override fun getTableCellRendererComponent(
                    table: JTable?,
                    value: Any?,
                    isSelected: Boolean,
                    hasFocus: Boolean,
                    row: Int,
                    column: Int,
                ): JLabel {
                    val label = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column) as JLabel
                    label.horizontalAlignment = JLabel.LEFT
                    label.font = Font(label.font.name, Font.BOLD, label.font.size)
                    return label
                }
            }
        val table =
            JTable(model).apply {
                rowHeight = CodeModernizerUIConstants.PLAN_CONSTRAINTS.TABLE_ROW_HEIGHT
                tableHeader.defaultRenderer = cellRenderer
            }
        return table
    }

    private fun transformationPlanPanel(plan: TransformationPlan) =
        JPanel(GridBagLayout()).apply {
            val stepsIntroTitle =
                JLabel(message("codemodernizer.migration_plan.body.steps_intro_title")).apply {
                    font =
                        font.deriveFont(
                            CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                            CodeModernizerUIConstants.PLAN_CONSTRAINTS.SUBTITLE_FONT_SIZE,
                        )
                    border = CodeModernizerUIConstants.STEPS_INTRO_TITLE_BORDER
                    alignmentX = Component.LEFT_ALIGNMENT
                }
            val stepsIntro =
                JPanel().apply {
                    layout = BoxLayout(this, BoxLayout.Y_AXIS)
                    add(stepsIntroTitle)
                    val stepsIntroSubtitle =
                        JEditorPane("text/html", message("codemodernizer.migration_plan.body.steps_intro_subtitle")).apply {
                            addHyperlinkListener { he ->
                                if (he.eventType == HyperlinkEvent.EventType.ACTIVATED) {
                                    BrowserUtil.browse(he.url)
                                }
                            }
                            isEditable = false
                            isOpaque = false
                            alignmentX = Component.LEFT_ALIGNMENT
                            font =
                                font.deriveFont(
                                    CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                                    CodeModernizerUIConstants.PLAN_CONSTRAINTS.SUBTITLE_FONT_SIZE,
                                )
                        }
                    add(stepsIntroSubtitle)
                    border = CodeModernizerUIConstants.STEPS_INTRO_BORDER
                }
            add(stepsIntro, CodeModernizerUIConstants.transformationPlanPlaneConstraint)
            // ignore step 0 since that contains info used to create tables in the plan
            plan.transformationSteps().drop(1).forEachIndexed { _, step ->
                var row: JPanel? = null
                row = transformationStepPanel(step)
                add(row, CodeModernizerUIConstants.transformationPlanPlaneConstraint)
            }
            border = CodeModernizerUIConstants.TRANSFORMATION_PLAN_PANEL_BORDER
        }

    private fun transformationPlanAppendix(table: PlanTable): JPanel {
        val panel =
            JPanel(GridBagLayout()).apply {
                val constraints = CodeModernizerUIConstants.transformationPlanAppendixConstraint
                val appendixTitle =
                    JLabel(message("codemodernizer.migration_plan.body.info.appendix_title")).apply {
                        font =
                            font.deriveFont(
                                CodeModernizerUIConstants.FONT_CONSTRAINTS.BOLD,
                                CodeModernizerUIConstants.PLAN_CONSTRAINTS.SUBTITLE_FONT_SIZE,
                            )
                        border = CodeModernizerUIConstants.APPENDIX_BORDER
                    }
                add(appendixTitle, constraints)

                val tableName =
                    JLabel(table.name).apply {
                        font =
                            font.deriveFont(
                                CodeModernizerUIConstants.FONT_CONSTRAINTS.PLAIN,
                                CodeModernizerUIConstants.PLAN_CONSTRAINTS.TABLE_NAME_FONT_SIZE,
                            )
                        border = CodeModernizerUIConstants.TABLE_NAME_BORDER
                    }
                add(tableName, constraints)

                val renderedAppendixTable =
                    createTable(table).apply {
                        tableHeader.reorderingAllowed = false // so that file click detection works; see below
                    }

                // make file paths blue
                val cellRenderer =
                    object : DefaultTableCellRenderer() {
                        override fun getTableCellRendererComponent(
                            table: JTable?,
                            value: Any?,
                            isSelected: Boolean,
                            hasFocus: Boolean,
                            row: Int,
                            column: Int,
                        ): JLabel {
                            val label = super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column) as JLabel
                            label.foreground = Color(89, 157, 246)
                            return label
                        }
                    }

                // file paths will be in leftmost column
                renderedAppendixTable.columnModel.getColumn(0).cellRenderer = cellRenderer

                renderedAppendixTable.addMouseListener(
                    object : MouseAdapter() {
                        override fun mouseClicked(e: MouseEvent) {
                            val row = renderedAppendixTable.rowAtPoint(e.point)
                            val col = renderedAppendixTable.columnAtPoint(e.point)
                            if (col == 0) { // means a file name was clicked
                                val fileClicked =
                                    LocalFileSystem.getInstance().findFileByPath(
                                        "${project.basePath}/${renderedAppendixTable.getValueAt(row, col)}",
                                    )
                                if (fileClicked != null) {
                                    FileEditorManager.getInstance(project).openFile(fileClicked, true)
                                }
                            }
                        }
                    },
                )

                val tablePanel =
                    JPanel().apply {
                        layout = BorderLayout()
                        add(JBScrollPane(renderedAppendixTable), BorderLayout.NORTH)
                        border = tableBorder(renderedAppendixTable.rowCount * renderedAppendixTable.rowHeight)
                    }
                add(
                    tablePanel,
                    constraints.apply {
                        weighty = 1.0
                        fill = GridBagConstraints.BOTH
                    },
                )
            }
        return panel
    }

    private fun transformationStepPanel(step: TransformationStep): JPanel {
        val nameLabel =
            JLabel(message("codemodernizer.migration_plan.body.steps_name", step.name())).apply {
                font =
                    font.deriveFont(
                        CodeModernizerUIConstants.FONT_CONSTRAINTS.PLAIN,
                        CodeModernizerUIConstants.PLAN_CONSTRAINTS.STEP_NAME_FONT_SIZE,
                    )
                border = CodeModernizerUIConstants.NAME_BORDER
            }

        val scrollPanel = createScrollPanel()
        val descriptionText =
            JTextArea(step.description()).apply {
                font = CodeModernizerUIConstants.DESCRIPTION_FONT
                isEditable = false
                wrapStyleWord = true
                lineWrap = true
                isOpaque = false
                border = CodeModernizerUIConstants.DESCRIPTION_BORDER
            }

        val table = tableMapping[step.id()]

        val parsedTable = table?.let {
            mapper.readValue<PlanTable>(it)
        }

        val renderedStepTable = parsedTable?.let {
            createTable(it)
        }

        val descriptionPanel =
            JPanel(BorderLayout()).apply {
                add(descriptionText, BorderLayout.NORTH)
                if (parsedTable != null) {
                    val tableName =
                        JLabel(parsedTable.name).apply {
                            font =
                                font.deriveFont(
                                    CodeModernizerUIConstants.FONT_CONSTRAINTS.PLAIN,
                                    CodeModernizerUIConstants.PLAN_CONSTRAINTS.TABLE_NAME_FONT_SIZE,
                                )
                            border = CodeModernizerUIConstants.TABLE_NAME_BORDER
                        }
                    add(tableName, BorderLayout.WEST)
                }
            }

        val headerPanel =
            JPanel(GridBagLayout()).apply {
                val constraints =
                    GridBagConstraints().apply {
                        fill = GridBagConstraints.HORIZONTAL
                        weightx = 1.0
                        anchor = GridBagConstraints.WEST
                    }
                add(nameLabel, constraints)

                constraints.weightx = 0.0
                constraints.anchor = GridBagConstraints.EAST
                add(scrollPanel, constraints)
            }

        val tablePanel = renderedStepTable?.let {
            JPanel().apply {
                layout = BorderLayout()
                add(JBScrollPane(it), BorderLayout.NORTH)
                border = tableBorder(it.rowCount * it.rowHeight)
            }
        }

        val transformationStepPanel =
            JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                add(headerPanel)
                add(descriptionPanel)
                if (tablePanel != null) {
                    add(tablePanel)
                }
                border = CodeModernizerUIConstants.TRANSFORMATION_STEP_PANEL_COMPOUND_BORDER
            }
        return transformationStepPanel
    }

    private fun getTransformationIcon(name: String?): Icon =
        when (name) {
            "linesOfCode" ->
                if (JBColor.isBright()) AwsIcons.CodeTransform.PLAN_VARIABLES_LIGHT else AwsIcons.CodeTransform.PLAN_VARIABLES_DARK
            "plannedDependencyChanges" ->
                if (JBColor.isBright()) AwsIcons.CodeTransform.PLAN_DEPENDENCIES_LIGHT else AwsIcons.CodeTransform.PLAN_DEPENDENCIES_DARK
            "plannedDeprecatedApiChanges" ->
                if (JBColor.isBright()) AwsIcons.CodeTransform.PLAN_STEP_INTO_LIGHT else AwsIcons.CodeTransform.PLAN_STEP_INTO_DARK
            "plannedFileChanges" ->
                if (JBColor.isBright()) AwsIcons.CodeTransform.PLAN_FILE_LIGHT else AwsIcons.CodeTransform.PLAN_FILE_DARK
            else -> if (JBColor.isBright()) AwsIcons.CodeTransform.PLAN_DEFAULT_LIGHT else AwsIcons.CodeTransform.PLAN_DEFAULT_DARK
        }

    private fun transformationPlanInfo(table: PlanTable) =
        JPanel().apply {
            layout = GridLayout(1, 2)
            val jobStatistics = table.rows
            val stepsInfo =
                JPanel().apply {
                    layout = BoxLayout(this, BoxLayout.Y_AXIS)
                    jobStatistics.forEach { stat ->
                        if (!stat.name.isNullOrEmpty() && !stat.value.isNullOrEmpty()) {
                            val formattedStatName = getFormattedString(stat.name)
                            add(
                                JLabel(
                                    message("codemodernizer.migration_plan.body.info.job_statistic_message", formattedStatName, stat.value),
                                    getTransformationIcon(stat.name),
                                    JLabel.LEFT,
                                ),
                            )
                        }
                    }
                    addHorizontalGlue()
                    border = CodeModernizerUIConstants.TRANSFORMATION_STEPS_INFO_BORDER
                    font = font.deriveFont(CodeModernizerUIConstants.PLAN_CONSTRAINTS.STEP_INFO_FONT_SIZE)
                }

            val qctInfo =
                JPanel().apply {
                    layout = GridLayout()
                    val qctPlanInfo = JEditorPane("text/html", message("codemodernizer.migration_plan.header.awsq"))
                    qctPlanInfo.isEditable = false
                    qctPlanInfo.isOpaque = false
                    add(qctPlanInfo)
                    border = CodeModernizerUIConstants.TRANSFORMATION_STEPS_QCT_INFO_BORDER
                    font = font.deriveFont(CodeModernizerUIConstants.PLAN_CONSTRAINTS.STEP_NAME_FONT_SIZE)
                }
            add(qctInfo)
            add(stepsInfo)
            border = CodeModernizerUIConstants.TRANSFORMATION_PLAN_INFO_BORDER
        }

    private fun tableBorder(bottomPadding: Int) =
        BorderFactory.createEmptyBorder(
            CodeModernizerUIConstants.PLAN_CONSTRAINTS.TABLE_PADDING_TOP,
            CodeModernizerUIConstants.PLAN_CONSTRAINTS.TABLE_PADDING_LEFT,
            bottomPadding,
            CodeModernizerUIConstants.PLAN_CONSTRAINTS.TABLE_PADDING_RIGHT,
        )
}
