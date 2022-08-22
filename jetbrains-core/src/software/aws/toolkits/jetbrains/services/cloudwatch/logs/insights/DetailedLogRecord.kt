// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.components.breadcrumbs.Breadcrumbs
import com.intellij.ui.table.TableView
import com.intellij.util.ExceptionUtil
import com.intellij.util.ui.ListTableModel
import com.intellij.util.ui.StatusText
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LocationCrumbs
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JPanel

class DetailedLogRecord(
    private val project: Project,
    private val client: CloudWatchLogsClient,
    private val logRecordPointer: String
) : Disposable {
    private val coroutineScope = disposableCoroutineScope(this)
    val title = message("cloudwatch.logs.log_record", logRecordPointer)

    private lateinit var breadcrumbHolder: JPanel
    private lateinit var locationInformation: Breadcrumbs
    lateinit var basePanel: JPanel
        private set
    lateinit var tableView: TableView<LogRecordFieldPair>
        private set
    private val recordLoadTask: Deferred<LogRecord>

    private fun createUIComponents() {
        val model = ListTableModel<LogRecordFieldPair>(
            LogRecordFieldColumn(),
            LogRecordValueColumn()
        )
        tableView = TableView(model).apply {
            setPaintBusy(true)
            emptyText.text = message("loading_resource.loading")
        }
        tableView.emptyText.text = StatusText.getDefaultEmptyText()
        TableSpeedSearch(tableView)
    }

    init {
        recordLoadTask = loadLogRecordAsync()
        locationInformation.isVisible = false
        coroutineScope.launch {
            val record = recordLoadTask.await()
            val items = record.map { it.key to it.value }

            runInEdt {
                tableView.listTableModel.items = items
                tableView.setPaintBusy(false)
            }

            if (items.isNotEmpty()) {
                val logGroup = record["@log"] ?: return@launch
                val logStream = record["@logStream"] ?: return@launch
                val locationCrumbs = LocationCrumbs(project, extractLogGroup(logGroup), logStream)
                locationInformation.crumbs = locationCrumbs.crumbs
                breadcrumbHolder.border = locationCrumbs.border
                locationInformation.isVisible = true
            }
        }
    }

    private fun loadLogRecordAsync() = coroutineScope.async<LogRecord> {
        var result = Result.Succeeded
        try {
            return@async client.getLogRecord {
                it.logRecordPointer(logRecordPointer)
            }.logRecord()
        } catch (e: Exception) {
            LOG.warn(e) { "Exception thrown while loading log record $logRecordPointer" }
            notifyError(
                project = project,
                title = message("cloudwatch.logs.exception"),
                content = ExceptionUtil.getThrowableText(e)
            )
            result = Result.Failed
        } finally {
            CloudwatchinsightsTelemetry.openDetailedLogRecord(project, result)
        }

        return@async mapOf()
    }

    override fun dispose() {
    }

    fun getComponent() = basePanel

    @TestOnly
    internal fun isLoaded() = recordLoadTask.isCompleted

    companion object {
        private val LOG = getLogger<DetailedLogRecord>()

        // Log group names can be between 1 and 512 characters long.
        // Log group names consist of the following characters: a-z, A-Z, 0-9, '_' (underscore), '-' (hyphen), '/' (forward slash), '.' (period), and '#' (number sign)
        // https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_CreateLogGroup.html
        private val logGroupRegex = Regex("\\d{12}:(.{1,512})")

        fun extractLogGroup(log: String) =
            // conveniently, the @log field has the account ID prepended, which we don't want
            // @log is a log group identifier in the form of account-id:log-group-name. This can be useful in queries of multiple log groups, to identify which log group a particular event belongs to.
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData-discoverable-fields.html
            logGroupRegex.find(log)?.groups?.get(1)?.value
                ?: throw IllegalStateException("$log format does not appear to be in a valid format (<account-id>:<log-group-name>)")
    }
}
