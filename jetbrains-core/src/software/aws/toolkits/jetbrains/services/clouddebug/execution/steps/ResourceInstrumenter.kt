// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.services.clouddebug.CliOutputParser
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants
import software.aws.toolkits.jetbrains.services.clouddebug.execution.CliBasedStep
import software.aws.toolkits.jetbrains.services.clouddebug.execution.Context
import software.aws.toolkits.jetbrains.services.clouddebug.execution.MessageEmitter
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration
import java.time.Instant

class ResourceInstrumenter(private val settings: EcsServiceCloudDebuggingRunSettings) : CliBasedStep() {
    override val stepName = message("cloud_debug.step.instrument", EcsUtils.serviceArnToName(settings.serviceArn))

    override fun constructCommandLine(context: Context, commandLine: GeneralCommandLine) {
        val iamRole = context.getRequiredAttribute(CloudDebugConstants.INSTRUMENT_IAM_ROLE_KEY)
        val serviceName = EcsUtils.originalServiceName(settings.serviceArn)

        commandLine
            .withParameters("--verbose")
            .withParameters("--json")
            .withParameters("instrument")
            .withParameters("ecs")
            .withParameters("service")
            .withParameters("--cluster")
            .withParameters(EcsUtils.clusterArnToName(settings.clusterArn))
            .withParameters("--service")
            .withParameters(serviceName)
            .withParameters("--iam-role")
            .withParameters(iamRole)
            .withEnvironment(settings.region.toEnvironmentVariables())
            .withEnvironment(settings.credentialProvider.resolveCredentials().toEnvironmentVariables())
    }

    override fun recordTelemetry(context: Context, startTime: Instant, result: Result) {
        ClouddebugTelemetry.instrument(
            context.project,
            result = result,
            workflowtoken = context.workflowToken,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble()
        )
    }

    override fun handleSuccessResult(output: String, messageEmitter: MessageEmitter, context: Context) {
        val targets = CliOutputParser.parseInstrumentResponse(output) ?: throw RuntimeException("Could not get targets from response")
        /* TODO uncomment this when the cli conforms to the contract
        val mappedTargets = targets.targets.map { it.name to it.target }.toMap()

        context.putAttribute(TARGET_MAPPING, mappedTargets)*/
        context.putAttribute(TARGET_MAPPING, targets.target)
    }

    companion object {
        /* TODO uncomment this when the cli conforms to the contract
        private val TARGET_MAPPING = AttributeBagKey.create<Map<String, String>>("targetMapping")
        */
        private val TARGET_MAPPING = AttributeBagKey.create<String>("targetMapping")

        @Suppress("UNUSED_PARAMETER")
        fun getTargetForContainer(context: Context, containerName: String): String = context.getRequiredAttribute(TARGET_MAPPING)
        /* TODO uncomment this when the cli conforms to the contract
        fun getTargetForContainer(context: Context, containerName: String): String = context.getRequiredAttribute(TARGET_MAPPING)
            .getOrElse(containerName) { throw IllegalStateException("No target mapping for $containerName") }
         */
    }
}
