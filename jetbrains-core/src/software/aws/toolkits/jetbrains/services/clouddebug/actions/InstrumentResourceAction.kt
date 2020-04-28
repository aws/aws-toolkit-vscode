// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.utils.cloudDebugIsAvailable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration
import java.time.Instant

class InstrumentResourceFromExplorerAction :
    SingleResourceNodeAction<EcsServiceNode>(message("cloud_debug.instrument"), null) {
    override fun actionPerformed(selected: EcsServiceNode, e: AnActionEvent) {
        val clusterArn = selected.clusterArn()
        val serviceArn = selected.resourceArn()

        InstrumentResourceAction(
            clusterArn = clusterArn,
            serviceArn = serviceArn,
            selected = selected
        ).actionPerformed(e)
    }

    override fun update(selected: EcsServiceNode, e: AnActionEvent) {
        val activeRegion = e.getRequiredData(PlatformDataKeys.PROJECT).activeRegion()
        // If there are no supported debuggers, showing this will just be confusing
        e.presentation.isVisible = if (DebuggerSupport.debuggers().isEmpty()) {
            false
        } else {
            !EcsUtils.isInstrumented(selected.resourceArn()) && cloudDebugIsAvailable(activeRegion)
        }
    }
}

/**
 * Implements the "Enable Cloud Debugging" action in the ECS tree of AWS Explorer.
 */
class InstrumentResourceAction(
    private val clusterArn: String? = null,
    private val serviceArn: String? = null,
    private val selected: EcsServiceNode? = null
) : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        performAction(project)
    }

    fun performAction(project: Project) {
        clusterArn ?: return
        serviceArn ?: return

        val dialog = InstrumentDialogWrapper(project, clusterArn, serviceArn)
        if (dialog.showAndGet()) {
            val role = dialog.view.iamRole.selected() ?: throw IllegalStateException("Dialog failed to validate that a role was selected.")
            performAction(project, clusterArn, serviceArn, role.arn, selected)
        }
    }

    companion object {
        fun performAction(
            project: Project,
            clusterArn: String,
            serviceArn: String,
            roleArn: String,
            selected: EcsServiceNode?,
            callback: ((Boolean) -> Unit)? = null
        ) {
            InstrumentAction(
                project,
                EcsUtils.clusterArnToName(clusterArn),
                EcsUtils.serviceArnToName(serviceArn),
                roleArn,
                message("cloud_debug.instrument_resource.enable"),
                message("cloud_debug.instrument_resource.enable.success", EcsUtils.serviceArnToName(serviceArn)),
                message("cloud_debug.instrument_resource.enable.fail", EcsUtils.serviceArnToName(serviceArn))
            ).runAction(selected, callback)
        }
    }
}

internal class InstrumentAction(
    project: Project,
    val clusterName: String,
    val serviceName: String,
    private val roleArn: String,
    name: String,
    successMessage: String,
    failureMessage: String
) : PseCliAction(project, name, successMessage, failureMessage) {
    override fun buildCommandLine(cmd: GeneralCommandLine) {
        cmd
            .withParameters("--verbose")
            .withParameters("--json")
            .withParameters("instrument")
            .withParameters("ecs")
            .withParameters("service")
            .withParameters("--cluster")
            .withParameters(clusterName)
            .withParameters("--service")
            .withParameters(serviceName)
            .withParameters("--iam-role")
            .withParameters(roleArn)
    }

    override fun produceTelemetry(startTime: Instant, result: Result, version: String?) {
        ClouddebugTelemetry.instrument(
            project,
            result,
            version,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble(),
            createTime = startTime
        )
    }
}
