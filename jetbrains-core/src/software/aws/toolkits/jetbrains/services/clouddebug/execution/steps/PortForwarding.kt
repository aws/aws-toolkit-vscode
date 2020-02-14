// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution.steps

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.util.net.NetUtils
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
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

class SetUpPortForwarding(private val settings: EcsServiceCloudDebuggingRunSettings, private val enable: Boolean = true) : ParallelStep() {
    override val stepName = if (enable) {
        message("cloud_debug.step.port_forward")
    } else {
        message("cloud_debug.step.port_forward_cleanup")
    }
    override val hidden = false

    override fun buildChildSteps(context: Context): List<Step> {
        val portForwards = mutableListOf<PortForwarder>()

        settings.containerOptions.forEach { entry ->
            val container = entry.key
            val remoteDebugPorts = entry.value.remoteDebugPorts
            val containerLocalPorts = selectDebugPorts().getOrElse(container) {
                throw IllegalStateException("Local port list is missing for $container")
            }

            if (enable) {
                context.putAttribute(createLocalDebugPortKey(container), containerLocalPorts)
            }

            containerLocalPorts.zip(remoteDebugPorts).forEach { (local, remote) ->
                portForwards.add(PortForwarder(settings, container, local, remote, enable))
            }

            val ports = entry.value.portMappings
            ports.forEach { (localPort, remotePort) ->
                portForwards.add(PortForwarder(settings, container, localPort, remotePort, enable))
            }
        }

        return portForwards
    }

    private fun selectDebugPorts(): Map<String, List<Int>> {
        val numberOfPortsRequired = settings.containerOptions
            .values
            .sumBy { DebuggerSupport.debugger(it.platform).numberOfDebugPorts }

        val ports = NetUtils.findAvailableSocketPorts(numberOfPortsRequired).toList()

        var index = 0
        return settings.containerOptions
            .map {
                val numberOfPorts = DebuggerSupport.debugger(it.value.platform).numberOfDebugPorts
                val containerPorts = ports.subList(index, index + numberOfPorts)

                index += numberOfPorts

                it.key to containerPorts
            }
            .toMap()
    }

    companion object {
        private fun createLocalDebugPortKey(containerName: String): AttributeBagKey<List<Int>> = AttributeBagKey.create("localDebugPort-$containerName")

        fun getDebugPortsForContainer(context: Context, containerName: String): List<Int> = context.getRequiredAttribute(createLocalDebugPortKey(containerName))
    }
}

class PortForwarder(
    private val settings: EcsServiceCloudDebuggingRunSettings,
    private val containerName: String,
    private val localPort: Int,
    private val remotePort: Int,
    private val enable: Boolean
) : CliBasedStep() {
    // Convert ports to strings first, else it formats 8080 as 8,080
    override val stepName = message(
        "cloud_debug.step.port_forward.resource",
        if (enable) "Forward" else "Disable forwarding",
        containerName,
        remotePort.toString(),
        localPort.toString()
    )

    override fun constructCommandLine(context: Context, commandLine: GeneralCommandLine) {
        commandLine
            .withParameters("--verbose")
            .withParameters("--json")
            .withParameters("forward")
            .withParameters("--port")
            .withParameters("$localPort:$remotePort")
            .withParameters("--target")
            .withParameters(ResourceInstrumenter.getTargetForContainer(context, containerName))
            /* TODO remove this when the cli conforms to the ocntract */
            .withParameters("--selector")
            .withParameters(containerName)
            .withParameters("--operation")
            .withParameters(if (enable) "enable" else "disable")
            .withEnvironment(settings.region.toEnvironmentVariables())
            .withEnvironment(settings.credentialProvider.resolveCredentials().toEnvironmentVariables())
    }

    override fun recordTelemetry(context: Context, startTime: Instant, result: Result) {
        ClouddebugTelemetry.portForward(
            context.project,
            result,
            workflowtoken = context.workflowToken,
            value = Duration.between(startTime, Instant.now()).toMillis().toDouble(),
            createTime = startTime
            )
    }
}
