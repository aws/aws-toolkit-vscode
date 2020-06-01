// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogActor
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry

class TailLogsAction(private val project: Project, private val channel: () -> Channel<LogActor.Message>) :
    ToggleAction(message("cloudwatch.logs.tail"), null, AllIcons.RunConfigurations.Scroll_down),
    CoroutineScope by ApplicationThreadPoolScope("TailCloudWatchLogs"),
    DumbAware {
    private var isSelected = false
    var logStreamingJob: Job? = null
        private set
        @TestOnly get

    override fun isSelected(e: AnActionEvent): Boolean = isSelected

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        CloudwatchlogsTelemetry.tailStream(project, enabled = state)
        isSelected = state
        if (state) {
            startTailing()
        } else {
            stopTailing()
        }
    }

    private fun startTailing() {
        logStreamingJob = launch {
            while (true) {
                try {
                    channel().send(LogActor.Message.LoadForward)
                    delay(1000)
                } catch (e: ClosedSendChannelException) {
                    // Channel is closed, so break out of the while loop and kill the coroutine
                    break
                }
            }
        }
    }

    private fun stopTailing() {
        logStreamingJob?.cancel()
    }
}
