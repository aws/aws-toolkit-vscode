// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogActor
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import javax.swing.JPanel

class CloudWatchLogGroup(
    private val project: Project,
    logGroup: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var content: JPanel

    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var locationInformation: LocationBreadcrumbs

    val client: CloudWatchLogsClient = project.awsClient()
    private val groupTable: LogGroupTable = LogGroupTable(project, client, logGroup)

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
    }

    init {
        val locationCrumbs = LocationCrumbs(project, logGroup)
        locationInformation.crumbs = locationCrumbs.crumbs
        locationInformation.border = locationCrumbs.border
        locationInformation.installClickListener()

        Disposer.register(this, groupTable)
        tablePanel.setContent(groupTable.component)
        addToolbar()

        refreshTable()
    }

    private fun addToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(object : AnAction(message("explorer.refresh.title"), null, AllIcons.Actions.Refresh), DumbAware {
            override fun actionPerformed(e: AnActionEvent) {
                CloudwatchlogsTelemetry.refreshGroup(project)
                refreshTable()
            }
        })
        tablePanel.toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false).component
    }

    private fun refreshTable() {
        launch { groupTable.channel.send(LogActor.Message.LOAD_INITIAL()) }
    }

    override fun dispose() {}
}
