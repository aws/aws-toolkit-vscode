// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.impl.runUnlessDisposed
import com.intellij.openapi.project.Project
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBTextField
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.RowFilter
import javax.swing.SortOrder
import javax.swing.event.DocumentEvent

class CloudWatchLogGroup(
    private val project: Project,
    private val logGroup: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    val title = message("cloudwatch.logs.log_group_title", logGroup.split("/").last())
    lateinit var content: JPanel

    private lateinit var refreshButton: JButton
    private lateinit var locationInformation: JLabel
    private lateinit var filterField: JBTextField
    private lateinit var tableScroll: JScrollPane
    private lateinit var groupTable: JBTable
    private lateinit var tableModel: ListTableModel<LogStream>

    private val client: CloudWatchLogsClient = project.awsClient()

    private val edtContext = getCoroutineUiContext(disposable = this)

    private fun createUIComponents() {
        tableModel = ListTableModel(
            arrayOf(CloudWatchLogsStreamsColumn(), CloudWatchLogsStreamsColumnDate()),
            mutableListOf<LogStream>(),
            // To display and sort by different values, we sort the model's values instead
            -1,
            SortOrder.UNSORTED
        )
        groupTable = JBTable(tableModel).apply {
            setPaintBusy(true)
            autoscrolls = true
            emptyText.text = message("loading_resource.loading")
            tableHeader.reorderingAllowed = false
        }
        groupTable.rowSorter = LogGroupTableSorter(tableModel)

        addTableMouseListener(groupTable)
        tableScroll = ScrollPaneFactory.createScrollPane(groupTable)
    }

    init {
        locationInformation.text = "${project.activeCredentialProvider().displayName} => ${project.activeRegion().displayName} => $logGroup"
        filterField.emptyText.text = message("cloudwatch.logs.filter_log_streams")
        filterField.document.addDocumentListener(buildStreamSearchListener(groupTable))

        styleRefreshButton()

        launch { refreshLogStreams() }
    }

    private fun buildStreamSearchListener(table: JBTable) = object : DocumentAdapter() {
        override fun textChanged(e: DocumentEvent) {
            val text = filterField.text
            val sorter = (table.rowSorter as LogGroupTableSorter)
            if (text.isNullOrBlank()) {
                sorter.rowFilter = null
            } else {
                sorter.rowFilter = RowFilter.regexFilter(text)
            }
        }
    }

    private fun addTableMouseListener(table: JBTable) {
        object : DoubleClickListener() {
            override fun onDoubleClick(e: MouseEvent?): Boolean {
                e ?: return false
                val row = table.selectedRow.takeIf { it >= 0 } ?: return false
                val logStream = table.getValueAt(row, 0) as? String ?: return false
                val window = CloudWatchLogWindow.getInstance(project)
                launch {
                    window.showLog(logGroup, logStream)
                }
                return true
            }
        }.installOn(table)
    }

    private fun styleRefreshButton() {
        refreshButton.background = null
        refreshButton.border = null
        refreshButton.icon = AllIcons.Actions.Refresh
        refreshButton.addActionListener { launch { refreshLogStreams() } }
    }

    private suspend fun refreshLogStreams() {
        withContext(edtContext) {
            groupTable.setPaintBusy(true)
        }
        populateModel()
        withContext(edtContext) {
            groupTable.emptyText.text = message("cloudwatch.logs.no_log_groups")
            groupTable.setPaintBusy(false)
        }
    }

    private suspend fun populateModel() = runUnlessDisposed(this) {
        try {
            val streams = client.describeLogStreamsPaginator(DescribeLogStreamsRequest.builder().logGroupName(logGroup).build())
            streams.filterNotNull().firstOrNull()?.logStreams()?.sortedBy { it.lastEventTimestamp() }?.let {
                withContext(edtContext) { tableModel.items = it }
            }
        } catch (e: Exception) {
            val errorMessage = message("cloudwatch.logs.failed_to_load_streams", logGroup)
            LOG.error(e) { errorMessage }
            notifyError(title = errorMessage, project = project)
        }
    }

    override fun dispose() {}

    companion object {
        val LOG = getLogger<CloudWatchLogGroup>()
    }
}
