// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.SimpleListCellRenderer
import com.michaelbaranov.microba.calendar.DatePicker
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import java.text.NumberFormat
import java.time.temporal.ChronoUnit
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JFormattedTextField
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JRadioButton
import javax.swing.JTextArea
import javax.swing.JTextField

class QueryEditor internal constructor(
    private val project: Project,
    val logGroupNames: List<String>
) {
    lateinit var absoluteTimeRadioButton: JRadioButton
    lateinit var relativeTimeRadioButton: JRadioButton
    lateinit var searchTerm: JRadioButton
    lateinit var querySearchTerm: JTextField
    lateinit var queryLogGroupsRadioButton: JRadioButton
    lateinit var saveQueryButton: JButton
    lateinit var retrieveSavedQueriesButton: JButton
    private lateinit var tablePanel: SimpleToolWindowPanel
    lateinit var queryBox: JTextArea
    lateinit var logGroupLabel: JLabel
    lateinit var endDate: DatePicker
    lateinit var queryEditorBasePanel: JPanel
    lateinit var relativeTimeUnit: JComboBox<Pair<String, ChronoUnit>>
    lateinit var relativeTimeNumber: JFormattedTextField
    lateinit var startDate: DatePicker
    private lateinit var showLogGroupTable: AddRemoveLogGroupTable

    private fun initArLogGroupTable() {
        showLogGroupTable.tableView.listTableModel
        showLogGroupTable.getSelLogGroups()
    }

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
        showLogGroupTable = AddRemoveLogGroupTable(project)
        initArLogGroupTable()
        // tablePanel.setContent(showLogGroupTable.component)
        relativeTimeNumber = JFormattedTextField(NumberFormat.getIntegerInstance())
        relativeTimeUnit = ComboBox(timeUnits)
        relativeTimeUnit.renderer = timeUnitComboBoxRenderer
    }

    init {
        absoluteTimeRadioButton.addActionListener {
            setAbsolute()
        }

        relativeTimeRadioButton.addActionListener {
            setRelative()
        }

        queryLogGroupsRadioButton.addActionListener {
            setQueryLanguage()
        }

        searchTerm.addActionListener {
            setSearchTerm()
        }

        saveQueryButton.addActionListener {
            val query = if (queryBox.text.isNotEmpty()) queryBox.text else DEFAULT_INSIGHTS_QUERY_STRING
            SaveQueryDialog(project, query, logGroupNames).show()
        }

        startDate.isEnabled = false
        endDate.isEnabled = false
        relativeTimeNumber.isEnabled = true
        relativeTimeUnit.isEnabled = true
        querySearchTerm.isEnabled = true
        queryBox.isEnabled = false
        saveQueryButton.isEnabled = false
        queryLogGroupsRadioButton.isSelected = true
        queryBox.text = DEFAULT_INSIGHTS_QUERY_STRING
    }

    fun setAbsolute() {
        absoluteTimeRadioButton.isSelected = true
        startDate.isEnabled = true
        endDate.isEnabled = true
        relativeTimeNumber.isEnabled = false
        relativeTimeUnit.isEnabled = false
    }

    fun setRelative() {
        relativeTimeRadioButton.isSelected = true
        startDate.isEnabled = false
        endDate.isEnabled = false
        relativeTimeNumber.isEnabled = true
        relativeTimeUnit.isEnabled = true
    }

    fun setSearchTerm() {
        searchTerm.isSelected = true
        queryBox.isEnabled = false
        querySearchTerm.isEnabled = true
        saveQueryButton.isEnabled = false
    }

    fun setQueryLanguage() {
        queryLogGroupsRadioButton.isEnabled = true
        queryBox.isEnabled = true
        querySearchTerm.isEnabled = false
        saveQueryButton.isEnabled = true
    }

    fun getSelectedTimeUnit(): ChronoUnit {
        val unit = relativeTimeUnit.selected() ?: let {
            LOG.error("No relative time unit was selected!")
            timeUnits.first()
        }

        return unit.second
    }

    companion object {
        private val LOG = getLogger<QueryEditor>()

        private val timeUnits = arrayOf(
            message("cloudwatch.logs.time_minutes") to ChronoUnit.MINUTES,
            message("cloudwatch.logs.time_hours") to ChronoUnit.HOURS,
            message("cloudwatch.logs.time_days") to ChronoUnit.DAYS,
            message("cloudwatch.logs.time_weeks") to ChronoUnit.WEEKS
        )

        private val timeUnitComboBoxRenderer = SimpleListCellRenderer.create<Pair<String, ChronoUnit>>("") {
            it.first
        }
    }
}
