// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.PopupHandler
import com.intellij.ui.components.JBTextField
import com.intellij.ui.components.panels.Wrapper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
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
import javax.swing.JLabel
import javax.swing.JPanel

class CloudWatchLogStream(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    private val startTime: Long? = null,
    private val duration: Duration? = null
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogStream"), Disposable {
    lateinit var content: JPanel
    lateinit var logsPanel: Wrapper
    lateinit var searchLabel: JLabel
    lateinit var searchField: JBTextField
    lateinit var toolbarHolder: Wrapper

    private val edtContext = getCoroutineUiContext(disposable = this)

    private val logStreamTable: LogStreamTable = LogStreamTable(project, logGroup, logStream, LogStreamTable.TableType.LIST)
    private var searchStreamTable: LogStreamTable? = null

    init {
        logsPanel.setContent(logStreamTable.component)
        Disposer.register(this, logStreamTable)
        searchLabel.text = "${project.activeCredentialProvider().displayName} => ${project.activeRegion().displayName} => $logGroup => $logStream"
        searchField.emptyText.text = message("cloudwatch.logs.filter_logs")

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
        searchField.addActionListener(object : ActionListener {
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
                        logsPanel.setContent(logStreamTable.component)
                        // Dispose the old one if it was not null
                        oldTable?.let { launch { Disposer.dispose(it) } }
                    }
                } else {
                    // This is thread safe because the actionPerformed is run on the UI thread
                    val table = LogStreamTable(project, logGroup, logStream, LogStreamTable.TableType.FILTER)
                    Disposer.register(this@CloudWatchLogStream, table)
                    searchStreamTable = table
                    launch(edtContext) {
                        logsPanel.setContent(table.component)
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
        toolbarHolder.setContent(toolbar.component)
    }

    override fun dispose() {}
}
