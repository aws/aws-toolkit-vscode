// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.clouddebug.execution.CliBasedStep
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.clouddebug.execution.ParallelStep
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Step
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration
import java.time.Instant

class CopyArtifactsStep(private val settings: EcsServiceCloudDebuggingRunSettings) : ParallelStep() {
    override val stepName = message("cloud_debug.step.sync")
    override val hidden = false

    override fun buildChildSteps(context: Context): List<Step> {
        val containerMap = mutableMapOf<CloudDebuggingPlatform, String>()

        val stepList = settings.containerOptions.map {
            it.value.artifactMappings.map { artifactMapping ->
                val localPath = artifactMapping.localPath
                val remotePath = artifactMapping.remotePath

                ResourceTransferStep(localPath, remotePath, it.key)
            }.also { _ ->
                containerMap[it.value.platform] = it.key
            }
        }.flatten()

        // since we copy to the shared volume, it does not matter that much which container we copy to, but
        // we only want to copy once, so build those steps out of the computed set
        return stepList.plus(
            containerMap.mapNotNull {
                addDebuggerIfNeeded(it.value, it.key, context)
            }
        )
    }

    private fun addDebuggerIfNeeded(containerName: String, platform: CloudDebuggingPlatform, context: Context): Step? {
        val debuggerSupport =
            DebuggerSupport.debuggers()[platform] ?: throw IllegalStateException(message("cloud_debug.run_configuration.bad_runtime", platform))
        return debuggerSupport.createDebuggerUploadStep(context, containerName)
    }
}

class ResourceTransferStep(private val localPath: String, private val remotePath: String, private val containerName: String) : CliBasedStep() {
    override val stepName = message("cloud_debug.step.copy_folder", localPath)

    override fun constructCommandLine(context: Context, commandLine: GeneralCommandLine) {
        // TODO: Update with token based CLI
        commandLine
            .withParameters("--verbose")
            .withParameters("--json")
            .withParameters("copy")
            .withParameters("--src")
            .withParameters(localPath)
            .withParameters("--dest")
            .withParameters("remote://${ResourceInstrumenter.getTargetForContainer(context, containerName)}://$containerName://$remotePath")
    }

    override fun recordTelemetry(context: Context, startTime: Instant, result: Result) {
        ClouddebugTelemetry.copy(
            context.project,
            result = result,
            workflowtoken = context.workflowToken,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble()
        )
    }
}
