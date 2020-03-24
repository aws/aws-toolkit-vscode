// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.PopupHandler
import com.intellij.ui.SearchTextField
import com.intellij.ui.components.breadcrumbs.Breadcrumbs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsAsyncClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.OpenCurrentInEditor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.ShowLogsAroundGroup
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.TailLogs
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogs
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.awt.event.ActionListener
import java.time.Duration
import javax.swing.JPanel

class CloudWatchLogStream(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    private val startTime: Long? = null,
    private val duration: Duration? = null
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogStream"), Disposable {
    lateinit var content: JPanel
    private lateinit var breadcrumbHolder: JPanel
    private lateinit var locationInformation: Breadcrumbs
    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var searchField: SearchTextField

    private val edtContext = getCoroutineUiContext(disposable = this)

    private val client: CloudWatchLogsAsyncClient = project.awsClient()
    private val logStreamTable: LogStreamTable = LogStreamTable(project, client, logGroup, logStream, LogStreamTable.TableType.LIST)
    private var searchStreamTable: LogStreamTable? = null

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
        searchField = SearchTextField(false)
    }

    init {
        tablePanel.setContent(logStreamTable.component)

        val locationCrumbs = LocationCrumbs(project, logGroup, logStream)
        locationInformation.crumbs = locationCrumbs.crumbs
        breadcrumbHolder.border = locationCrumbs.border

        Disposer.register(this, logStreamTable)
        searchField.textEditor.emptyText.text = message("cloudwatch.logs.filter_logs")

        addAction()
        addActionToolbar()
        addSearchListener()

        launch {
            if (startTime != null && duration != null) {
                logStreamTable.channel.send(LogStreamActor.Message.LOAD_INITIAL_RANGE(startTime, duration))
            } else {
                logStreamTable.channel.send(LogStreamActor.Message.LOAD_INITIAL())
            }
        }
    }

    private fun addSearchListener() {
        searchField.textEditor.addActionListener(object : ActionListener {
            private var lastText = ""
            override fun actionPerformed(e: ActionEvent?) {
                val searchFieldText = searchField.text.trim()
                if (searchFieldText == lastText) {
                    return
                }
                lastText = searchFieldText
                val oldTable = searchStreamTable
                // If it is empty, replace the table with the original table
                if (searchFieldText.isEmpty()) {
                    searchStreamTable = null
                    launch(edtContext) {
                        tablePanel.setContent(logStreamTable.component)
                        // Dispose the old one if it was not null
                        oldTable?.let { launch { Disposer.dispose(it) } }
                    }
                } else {
                    // This is thread safe because the actionPerformed is run on the UI thread
                    val table = LogStreamTable(project, client, logGroup, logStream, LogStreamTable.TableType.FILTER)
                    Disposer.register(this@CloudWatchLogStream, table)
                    searchStreamTable = table
                    launch(edtContext) {
                        tablePanel.setContent(table.component)
                        oldTable?.let { launch { Disposer.dispose(it) } }
                    }
                    launch {
                        table.channel.send(LogStreamActor.Message.LOAD_INITIAL_FILTER(searchFieldText))
                    }
                }
            }
        })
    }

    private fun addAction() {
        val actionGroup = DefaultActionGroup()
        actionGroup.add(OpenCurrentInEditor(project, logStream) {
            searchStreamTable?.logsTable?.listTableModel?.items ?: logStreamTable.logsTable.listTableModel.items
        })
        actionGroup.add(Separator())
        actionGroup.add(ShowLogsAroundGroup(logGroup, logStream, logStreamTable.logsTable))
        PopupHandler.installPopupHandler(
            logStreamTable.logsTable,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun addActionToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.add(OpenCurrentInEditor(project, logStream) {
            searchStreamTable?.logsTable?.listTableModel?.items ?: logStreamTable.logsTable.listTableModel.items
        })
        actionGroup.add(TailLogs { searchStreamTable?.channel ?: logStreamTable.channel })
        actionGroup.add(WrapLogs { searchStreamTable?.logsTable ?: logStreamTable.logsTable })
        val toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false)
        tablePanel.toolbar = toolbar.component
    }

    override fun dispose() {}
}
