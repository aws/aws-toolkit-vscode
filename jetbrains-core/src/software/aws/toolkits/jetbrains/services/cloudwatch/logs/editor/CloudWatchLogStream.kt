// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamActor
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollBar
import javax.swing.JScrollPane
import javax.swing.JTable
import javax.swing.JTextField
import javax.swing.SortOrder

class CloudWatchLogStream(
    private val project: Project,
    logGroup: String,
    private val logStream: String,
    startTime: Long? = null,
    duration: Long? = null
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var content: JPanel
    lateinit var logsPanel: JScrollPane
    lateinit var searchLabel: JLabel
    lateinit var searchField: JTextField
    lateinit var wrapButton: JButton
    lateinit var unwrapButton: JButton
    lateinit var streamLogsOn: JButton
    lateinit var streamLogsOff: JButton

    private val edtContext = getCoroutineUiContext(disposable = this)
    private val logStreamingJobLock = Object()
    private var logStreamingJob: Deferred<*>? = null

    private lateinit var logsTable: TableView<OutputLogEvent>
    private val logStreamClient: LogStreamActor

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
        logStreamClient = LogStreamActor(project.awsClient(), logsTable, logGroup, logStream)
        Disposer.register(this, logStreamClient)
        searchLabel.text = "${project.activeCredentialProvider().displayName} => ${project.activeRegion().displayName} => $logGroup => $logStream"
        logsTable.autoResizeMode = JTable.AUTO_RESIZE_ALL_COLUMNS
        logsPanel.verticalScrollBar.addAdjustmentListener {
            if (logsTable.model.rowCount == 0) {
                return@addAdjustmentListener
            }
            if (logsPanel.verticalScrollBar.isAtBottom()) {
                launch {
                    // Don't load more if there is a logStreamingJob because then it will just keep loading forever at the bottom
                    if (logStreamingJob == null) {
                        logStreamClient.channel.send(LogStreamActor.Messages.LOAD_FORWARD)
                    }
                }
            } else if (logsPanel.verticalScrollBar.isAtTop()) {
                launch { logStreamClient.channel.send(LogStreamActor.Messages.LOAD_BACKWARD) }
            }
        }
        launch {
            try {
                if (startTime != null && duration != null) {
                    logStreamClient.loadInitialRange(startTime, duration)
                } else {
                    logStreamClient.loadInitial()
                }
                logStreamClient.startListening()
            } catch (e: Exception) {
                val errorMessage = message("cloudwatch.logs.failed_to_load_stream", logStream)
                LOG.error(e) { errorMessage }
                notifyError(title = errorMessage, project = project)
                withContext(edtContext) { logsTable.emptyText.text = errorMessage }
            }
        }
        setUpTemporaryButtons()

        // addActions()
    }

    private fun setUpTemporaryButtons() {
        streamLogsOn.addActionListener {
            synchronized(logStreamingJobLock) {
                if (logStreamingJob != null) {
                    return@synchronized
                }
                logStreamingJob = async {
                    while (true) {
                        try {
                            logStreamClient.channel.send(LogStreamActor.Messages.LOAD_FORWARD)
                            delay(1000)
                        } catch (e: ClosedSendChannelException) {
                            // Channel is closed, so break out of the while loop and kill the coroutine
                            return@async
                        }
                    }
                }
            }
        }
        streamLogsOff.addActionListener {
            launch {
                val oldJob = synchronized(logStreamingJobLock) {
                    val oldJob = logStreamingJob
                    logStreamingJob = null
                    return@synchronized oldJob
                }
                oldJob?.cancelAndJoin()
            }
        }
    }

    /* will be added in the next PR but less annoying to comment out
    private fun addActions() {
        val actionGroup = DefaultActionGroup()
        actionGroup.add(OpenCurrentInEditor(project, logStream, logsTable.logsModel))
        actionGroup.add(Separator())
        actionGroup.add(ShowLogsAroundGroup(logGroup, logStream, logsTable))
        PopupHandler.installPopupHandler(
            logsTable,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }
    */

    override fun dispose() {}

    private fun JScrollBar.isAtBottom(): Boolean = value == (maximum - visibleAmount)
    private fun JScrollBar.isAtTop(): Boolean = value == minimum

    companion object {
        private val LOG = getLogger<CloudWatchLogStream>()
    }
}
