// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.util.execution.ParametersListUtil
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
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

class SetUpStartApplications(private val settings: EcsServiceCloudDebuggingRunSettings) : ParallelStep() {
    override val stepName = message("cloud_debug.step.start_application")
    override val hidden = false

    override fun buildChildSteps(context: Context): List<Step> = settings.containerOptions.map { (containerName, options) ->
        StartApplication(settings, containerName, options.startCommand)
    }
}

class StartApplication(
    private val settings: EcsServiceCloudDebuggingRunSettings,
    private val containerName: String,
    private val startCommand: String
) : CliBasedStep() {
    override val stepName = message("cloud_debug.step.start_application.resource", containerName)

    override fun constructCommandLine(context: Context, commandLine: GeneralCommandLine) {
        commandLine
            .withParameters("--verbose")
            .withParameters("--json")
            .withParameters("start")
            .withParameters("--target")
            .withParameters(ResourceInstrumenter.getTargetForContainer(context, containerName))
            /* TODO remove this when the cli conforms to the contract */
            .withParameters("--selector")
            .withParameters(containerName)
            .withParameters(ParametersListUtil.parse(startCommand, false, false))
            .withEnvironment(settings.region.toEnvironmentVariables())
            .withEnvironment(settings.credentialProvider.resolveCredentials().toEnvironmentVariables())
    }

    override fun recordTelemetry(context: Context, startTime: Instant, result: Result) {
        ClouddebugTelemetry.startApplication(
            context.project,
            result = result,
            workflowtoken = context.workflowToken,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble()
        )
    }
}
