// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration
import java.time.Instant

// TODO: generify for anything cloud debuggable
class DeinstrumentResourceFromExplorerAction : SingleResourceNodeAction<EcsServiceNode>(
    message("cloud_debug.instrument_resource.disable")
) {
    override fun actionPerformed(selected: EcsServiceNode, e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        val dialog = DeinstrumentDialogWrapper(project, selected.resourceArn())
        if (dialog.showAndGet()) {
            performAction(project, selected.clusterArn(), selected.resourceArn(), selected)
        }
    }

    override fun update(selected: EcsServiceNode, e: AnActionEvent) {
        // If there are no supported debuggers, showing this will just be confusing
        e.presentation.isVisible = if (DebuggerSupport.debuggers().isEmpty()) {
            false
        } else {
            EcsUtils.isInstrumented(selected.resourceArn())
        }
    }

    companion object {
        fun performAction(
            project: Project,
            clusterArn: String,
            instrumentedResourceName: String,
            selected: EcsServiceNode?,
            callback: ((Boolean) -> Unit)? = null
        ) {
            val originalServiceName = EcsUtils.originalServiceName(instrumentedResourceName)
            DeinstrumentAction(
                project,
                EcsUtils.clusterArnToName(clusterArn),
                originalServiceName,
                message("cloud_debug.instrument_resource.disable"),
                message("cloud_debug.instrument_resource.disable.success", originalServiceName),
                message("cloud_debug.instrument_resource.disable.failed", originalServiceName)
            ).runAction(selected, callback)
        }
    }
}

/**
 * Implements the "Disable Cloud Debugging" action in the ECS tree of AWS Explorer.
 */
internal class DeinstrumentAction(
    project: Project,
    private val clusterName: String,
    private val serviceName: String,
    name: String,
    successMessage: String,
    failureMessage: String
) : PseCliAction(project, name, successMessage, failureMessage) {
    override fun buildCommandLine(cmd: GeneralCommandLine) {
        cmd
            .withParameters("--verbose")
            .withParameters("--json")
            .withParameters("revert")
            .withParameters("ecs")
            .withParameters("service")
            .withParameters("--cluster")
            .withParameters(clusterName)
            .withParameters("--service")
            .withParameters(serviceName)
    }

    override fun produceTelemetry(startTime: Instant, result: Result, version: String?) {
        ClouddebugTelemetry.deinstrument(
            project,
            result,
            version,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble(),
            createTime = startTime
        )
    }
}
