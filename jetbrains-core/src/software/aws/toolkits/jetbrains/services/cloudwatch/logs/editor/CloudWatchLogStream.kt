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
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBTextField
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.OpenCurrentInEditor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.ShowLogsAroundGroup
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.TailLogs
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogs
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.time.Duration
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollBar
import javax.swing.JScrollPane
import javax.swing.JTable
import javax.swing.SortOrder

class CloudWatchLogStream(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    startTime: Long? = null,
    duration: Duration? = null
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var content: JPanel
    lateinit var logsPanel: JScrollPane
    lateinit var searchLabel: JLabel
    lateinit var searchField: JBTextField
    lateinit var toolbarHolder: Wrapper
    lateinit var toolWindow: JComponent

    private val edtContext = getCoroutineUiContext(disposable = this)

    private var logStreamingJob: Deferred<*>? = null

    private lateinit var logsTable: TableView<OutputLogEvent>
    private val logStreamActor: LogStreamActor

    private fun createUIComponents() {
        val model = ListTableModel<OutputLogEvent>(
            arrayOf(LogStreamDateColumn(), LogStreamMessageColumn()),
            mutableListOf<OutputLogEvent>(),
            // Don't sort in the model because the requests come sorted
            -1,
            SortOrder.UNSORTED
        )
        logsTable = TableView(model).apply {
            setPaintBusy(true)
            autoscrolls = true
            emptyText.text = message("loading_resource.loading")
            tableHeader.reorderingAllowed = false
        }
        // TODO fix resizing
        logsTable.columnModel.getColumn(0).preferredWidth = 150
        logsTable.columnModel.getColumn(0).maxWidth = 150
        logsTable.autoResizeMode = JTable.AUTO_RESIZE_LAST_COLUMN
        logsPanel = ScrollPaneFactory.createScrollPane(logsTable)
    }

    init {
        logStreamActor = LogStreamActor(project.awsClient(), logsTable, logGroup, logStream)
        Disposer.register(this, logStreamActor)
        searchLabel.text = "${project.activeCredentialProvider().displayName} => ${project.activeRegion().displayName} => $logGroup => $logStream"
        searchField.emptyText.text = message("cloudwatch.logs.filter_logs")
        logsTable.autoResizeMode = JTable.AUTO_RESIZE_ALL_COLUMNS
        logsPanel.verticalScrollBar.addAdjustmentListener {
            if (logsTable.model.rowCount == 0) {
                return@addAdjustmentListener
            }
            if (logsPanel.verticalScrollBar.isAtBottom()) {
                launch {
                    // Don't load more if there is a logStreamingJob because then it will just keep loading forever at the bottom
                    if (logStreamingJob == null) {
                        logStreamActor.channel.send(LogStreamActor.Messages.LOAD_FORWARD)
                    }
                }
            } else if (logsPanel.verticalScrollBar.isAtTop()) {
                launch { logStreamActor.channel.send(LogStreamActor.Messages.LOAD_BACKWARD) }
            }
        }
        launch {
            try {
                if (startTime != null && duration != null) {
                    logStreamActor.loadInitialRange(startTime, duration)
                } else {
                    logStreamActor.loadInitial()
                }
                logStreamActor.startListening()
            } catch (e: Exception) {
                val errorMessage = message("cloudwatch.logs.failed_to_load_stream", logStream)
                LOG.error(e) { errorMessage }
                notifyError(title = errorMessage, project = project)
                withContext(edtContext) { logsTable.emptyText.text = errorMessage }
            }
        }

        addAction()
        addActionToolbar()
    }

    private fun addAction() {
        val actionGroup = DefaultActionGroup()
        actionGroup.add(OpenCurrentInEditor(project, logStream, logsTable.listTableModel))
        actionGroup.add(Separator())
        actionGroup.add(ShowLogsAroundGroup(logGroup, logStream, logsTable))
        PopupHandler.installPopupHandler(
            logsTable,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun addActionToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.add(OpenCurrentInEditor(project, logStream, logsTable.listTableModel))
        actionGroup.add(TailLogs(logStreamActor.channel))
        actionGroup.add(WrapLogs(logsTable))
        val toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false)
        toolbarHolder.setContent(toolbar.component)
    }

    override fun dispose() {}

    private fun JScrollBar.isAtBottom(): Boolean = value == (maximum - visibleAmount)
    private fun JScrollBar.isAtTop(): Boolean = value == minimum

    companion object {
        private val LOG = getLogger<CloudWatchLogStream>()
    }
}
