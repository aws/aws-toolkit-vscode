// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.io.FileUtilRt.MEGABYTE
import com.intellij.openapi.util.io.FileUtilRt.getUserContentLoadLimit
import com.intellij.ui.table.JBTable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.io.File
import java.time.Instant

class OpenLogStreamInEditorAction(
    private val project: Project,
    private val client: CloudWatchLogsClient,
    private val logGroup: String,
    private val groupTable: JBTable
) : AnAction(message("cloudwatch.logs.open_in_editor"), null, AllIcons.Actions.Menu_open), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val row = groupTable.selectedRow.takeIf { it >= 0 } ?: return
        val logStream = groupTable.getValueAt(row, 0) as String
        ProgressManager.getInstance().run(LogStreamDownloadTask(project, client, logGroup, logStream))
    }
}

private class LogStreamDownloadTask(project: Project, val client: CloudWatchLogsClient, val logGroup: String, val logStream: String) :
    Task.Backgroundable(project, message("cloudwatch.logs.opening_in_editor", logStream), true),
    CoroutineScope by ApplicationThreadPoolScope("OpenLogStreamInEditor") {
    private val edt = getCoroutineUiContext(ModalityState.defaultModalityState())

    override fun run(indicator: ProgressIndicator) {
        runBlocking {
            runSuspend(indicator)
        }
    }

    suspend fun runSuspend(indicator: ProgressIndicator) {
        // Default content load limit is 20MB, default per page is 1MB/10000 log entries. so we load MaxLength/1MB
        // until we give up and prompt the user to save to file
        val maxPages = getUserContentLoadLimit() / (1 * MEGABYTE)
        val startTime = Instant.now()
        val buffer = StringBuilder()
        var index = 0
        val request = GetLogEventsRequest
            .builder()
            .startFromHead(true)
            .logGroupName(logGroup)
            .logStreamName(logStream)
            .endTime(startTime.toEpochMilli())
        val getRequest = client.getLogEventsPaginator(request.build())
        getRequest.stream().forEach {
            if (index >= maxPages) {
                runBlocking {
                    request.nextToken(it.nextForwardToken())
                    handleLargeLogStream(indicator, request.build(), buffer)
                    indicator.cancel()
                }
            }
            indicator.checkCanceled()
            buffer.append(it.events().buildStringFromLogsOutput())
            index++
        }

        OpenStreamInEditor.open(project, edt, logStream, buffer.toString())
    }

    private suspend fun handleLargeLogStream(indicator: ProgressIndicator, request: GetLogEventsRequest, buffer: StringBuilder) {
        if (promptWriteToFile() != Messages.OK) {
            indicator.cancel()
        } else {
            val descriptor = FileSaverDescriptor(message("s3.download.object.action"), message("s3.download.object.description"))
            val saveLocation = withContext(edt) {
                val destination = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)
                destination.save(null, null)
            }
            if (saveLocation != null) {
                streamLogStreamToFile(indicator, request, saveLocation.file, buffer)
            }
        }
    }

    private suspend fun promptWriteToFile(): Int = withContext(edt) {
        return@withContext Messages.showOkCancelDialog(
            project,
            message("cloudwatch.logs.stream_too_big_message", logStream),
            message("cloudwatch.logs.stream_too_big"),
            message("cloudwatch.logs.stream_save_to_file", logStream),
            Messages.CANCEL_BUTTON,
            AllIcons.General.QuestionDialog
        )
    }

    private fun streamLogStreamToFile(indicator: ProgressIndicator, request: GetLogEventsRequest, file: File, buffer: StringBuilder) {
        try {
            title = message("cloudwatch.logs.saving_to_disk", logStream)
            file.appendText(buffer.toString())
            val getRequest = client.getLogEventsPaginator(request)
            getRequest.stream().forEach {
                indicator.checkCanceled()
                val str = it.events().buildStringFromLogsOutput()
                file.appendText(str)
            }
            notifyInfo(
                project = project,
                title = message("aws.notification.title"),
                content = message("cloudwatch.logs.saving_to_disk_succeeded", logStream)
            )
        } catch (e: Exception) {
            LOG.error(e) { "Exception thrown while downloading large log stream" }
            e.notifyError(project = project, title = message("cloudwatch.logs.saving_to_disk_failed", logStream))
        }
    }

    companion object {
        private val LOG = getLogger<LogStreamDownloadTask>()
    }
}
