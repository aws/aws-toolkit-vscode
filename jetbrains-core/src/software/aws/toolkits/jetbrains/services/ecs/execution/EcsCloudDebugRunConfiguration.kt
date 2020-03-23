// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.ExecutionBundle
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunConfigurationWithSuppressedDefaultDebugAction
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.configurations.RuntimeConfigurationWarning
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunConfigurationWithSuppressedDefaultRunAction
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.options.SettingsEditorGroup
import com.intellij.openapi.project.Project
import org.jdom.Element
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants.DEFAULT_REMOTE_DEBUG_PORT
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.clouddebug.actions.InstrumentResourceAction
import software.aws.toolkits.jetbrains.services.clouddebug.execution.CloudDebugRunState
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionSettingsEditor
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionsRunConfigurationBase
import software.aws.toolkits.jetbrains.ui.connection.addAwsConnectionEditor
import software.aws.toolkits.resources.message

class EcsCloudDebugRunConfiguration(project: Project, private val configFactory: ConfigurationFactory) :
    AwsConnectionsRunConfigurationBase<EcsServiceCloudDebuggingOptions>(project, configFactory, null),
    RunConfigurationWithSuppressedDefaultRunAction,
    RunConfigurationWithSuppressedDefaultDebugAction {

    override val serializableOptions = EcsServiceCloudDebuggingOptions()

    @Suppress("UNCHECKED_CAST")
    override fun clone(): RunConfiguration {
        val element = Element("toClone")
        writeExternal(element)

        // Copy the config deeply to prevent aliasing
        val copy = configFactory.createTemplateConfiguration(project) as EcsCloudDebugRunConfiguration
        copy.name = name
        copy.readExternal(element)

        return copy
    }

    override fun getConfigurationEditor(): SettingsEditor<EcsCloudDebugRunConfiguration> {
        val group = SettingsEditorGroup<EcsCloudDebugRunConfiguration>()

        val editor = EcsCloudDebugSettingsEditor(project)
        group.addEditor(ExecutionBundle.message("run.configuration.configuration.tab.title"), editor)
        group.addAwsConnectionEditor(AwsConnectionSettingsEditor(project, editor::awsConnectionUpdated))

        return group
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): CloudDebugRunState? =
        try {
            val cloudDebugRunSettings = resolveEcsServiceCloudDebuggingRunSettings()

            CloudDebugRunState(environment, cloudDebugRunSettings)
        } catch (e: Exception) {
            LOG.error(e) { message("cloud_debug.run_configuration.getstate.failure") }

            null
        }

    override fun suggestedName() = clusterArn()?.let { cluster ->
        serviceArn()?.let { service ->
            "[${EcsUtils.clusterArnToName(cluster)}] ${EcsUtils.serviceArnToName(service)} (beta)"
        }
    }

    override fun checkSettingsBeforeRun() {
        val immutableSettings = resolveEcsServiceCloudDebuggingRunSettings()

        if (!EcsUtils.isInstrumented(immutableSettings.serviceArn)) {
            throw RuntimeConfigurationError(
                message("cloud_debug.run_configuration.not_instrumented.service", EcsUtils.serviceArnToName(immutableSettings.serviceArn))
            ) {
                InstrumentResourceAction(clusterArn(), serviceArn()).performAction(project)
            }
        }
    }

    override fun checkConfiguration() {
        val immutableSettings = resolveEcsServiceCloudDebuggingRunSettings()
        if (immutableSettings.containerOptions.isEmpty()) {
            throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.container"))
        }
        val localPortSet: MutableMap<Int, String> = mutableMapOf()
        val remotePortSet: MutableMap<Int, String> = mutableMapOf()
        immutableSettings.containerOptions.forEach { (name, options) ->
            checkStartupCommand(platform = options.platform, command = options.startCommand, containerName = name)
            checkArtifactsMapping(name = name, artifactMappings = options.artifactMappings)
            checkPortMappings(options = options, name = name, localPortSet = localPortSet, remotePortSet = remotePortSet)
            checkPerContainerWarnings(options = options, name = name)
        }
    }

    private fun checkStartupCommand(platform: CloudDebuggingPlatform, command: String, containerName: String) {
        val commandHelper = DebuggerSupport.debugger(platform).startupCommand()
        commandHelper.validateStartupCommand(command, containerName)
    }

    private fun checkArtifactsMapping(name: String, artifactMappings: List<ImmutableArtifactMapping>) {
        artifactMappings.groupBy { it.remotePath }.values.forEach {
            if (it.size > 1) {
                throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.duplicate_remote_artifact",
                        name,
                        it.first().remotePath
                    )
                )
            }
        }
    }

    private fun checkPortMappings(
        options: ImmutableContainerOptions,
        name: String,
        localPortSet: MutableMap<Int, String>,
        remotePortSet: MutableMap<Int, String>
    ) {
        // Check for remote debug port
        options.remoteDebugPorts.forEach { remoteDebugPort ->
            if (remoteDebugPort > 65535 || remoteDebugPort < 1) {
                throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.valid_debug_port", remoteDebugPort.toString(), name))
            }
        }

        options.portMappings.forEach { portMapping ->
            // Validate local debug port is not set twice
            when (localPortSet[portMapping.localPort]) {
                null -> localPortSet[portMapping.localPort] = name
                name ->
                    throw RuntimeConfigurationError(
                        message(
                            "cloud_debug.run_configuration.duplicate_local_port_same_container",
                            name,
                            portMapping.localPort.toString()
                        )
                    )
                else ->
                    throw RuntimeConfigurationError(
                        message(
                            "cloud_debug.run_configuration.duplicate_local_port",
                            localPortSet[portMapping.localPort].toString(),
                            name,
                            portMapping.localPort.toString()
                        )
                    )
            }
            // validate remote debug port is not set twice
            when (remotePortSet[portMapping.remotePort]) {
                null -> remotePortSet[portMapping.remotePort] = name
                "remote" -> throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.duplicate_remote_debug_port",
                        name,
                        portMapping.remotePort.toString()
                    )
                )
                name -> throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.duplicate_remote_port_same_container",
                        name,
                        portMapping.remotePort.toString()
                    )
                )
                else -> throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.duplicate_remote_port",
                        remotePortSet[portMapping.remotePort].toString(),
                        name,
                        portMapping.remotePort.toString()
                    )
                )
            }
        }
        // Add remote debug port to the remote port map and check
        options.remoteDebugPorts.forEach { remoteDebugPort ->
            when (remotePortSet[remoteDebugPort]) {
                null -> remotePortSet[remoteDebugPort] = "remote"
                else -> throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.duplicate_remote_debug_port",
                        name,
                        remoteDebugPort.toString()
                    )
                )
            }
        }
    }

    private fun checkPerContainerWarnings(options: ImmutableContainerOptions, name: String) {
        // TODO should we build up a warnings string so that we can display multiple warnings?
        options.artifactMappings.forEach { artifactMapping ->
            if (artifactMapping.remotePath.trim() == "/") {
                throw RuntimeConfigurationWarning(
                    message(
                        "cloud_debug.run_configuration.potential_data_loss",
                        name
                    )
                )
            }
        }
        // Check if we need a before task
        if (options.platform in CloudDebugConstants.RUNTIMES_REQUIRING_BEFORE_TASK && this.beforeRunTasks.isEmpty()) {
            throw RuntimeConfigurationWarning(message("cloud_debug.run_configuration.missing.before_task", name, options.platform.toString()))
        }
    }

    fun clusterArn(arn: String?) {
        serializableOptions.clusterArn = arn
    }

    fun clusterArn(): String? = serializableOptions.clusterArn

    fun serviceArn(arn: String?) {
        serializableOptions.serviceArn = arn
    }

    fun serviceArn(): String? = serializableOptions.serviceArn

    fun containerOptions(options: Map<String, ContainerOptions>) {
        serializableOptions.containerOptions = options.toSortedMap()
    }

    fun containerOptions(): Map<String, ContainerOptions> = serializableOptions.containerOptions

    private fun resolveEcsServiceCloudDebuggingRunSettings(): EcsServiceCloudDebuggingRunSettings {
        val region = resolveRegion()
        val credentialProvider = resolveCredentials()
        val clusterArn = clusterArn()
            ?: throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.cluster_arn"))

        val serviceArn = serviceArn()
            ?: throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.service_arn"))

        val usedRemotePorts = containerOptions().flatMap { containerOptions ->
            containerOptions.value.portMappings.map { mapping ->
                mapping.remotePort
            }.also {
                containerOptions.value.remoteDebugPorts?.let { ports ->
                    it.plus(ports)
                }
            }
        }.filterNotNull().toMutableSet()

        val resourceCache = AwsResourceCache.getInstance(project)
        val validContainerNames = try {
            val service = resourceCache.getResourceNow(
                EcsResources.describeService(clusterArn, serviceArn),
                region,
                credentialProvider
            )
            val containers = resourceCache.getResourceNow(
                EcsResources.listContainers(service.taskDefinition()),
                region,
                credentialProvider
            )

            containers.map { it.name() }.toSet()
        } catch (e: Exception) {
            throw RuntimeConfigurationError(e.message)
        }

        val containerOptionsMap = containerOptions().mapValues { (containerName, containerOptions) ->
            if (!validContainerNames.contains(containerName)) {
                throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.ecs.run_config.container.doesnt_exist_in_service",
                        containerName,
                        EcsUtils.serviceArnToName(serviceArn)
                    )
                )
            }
            resolveContainerOptions(containerName, containerOptions, usedRemotePorts)
        }.toSortedMap()
        return EcsServiceCloudDebuggingRunSettings(
            clusterArn,
            serviceArn,
            containerOptionsMap,
            credentialProvider,
            region
        )
    }

    private fun resolveContainerOptions(
        containerName: String,
        containerOptions: ContainerOptions,
        usedRemoteDebugPorts: MutableSet<Int>
    ): ImmutableContainerOptions {
        val platform = containerOptions.platform
            ?: throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.platform", containerName))

        val requiredNumOfPorts = DebuggerSupport.debugger(platform).numberOfDebugPorts
        val configuredRemoteDebugPorts = containerOptions.remoteDebugPorts

        val remoteDebugPorts = if (configuredRemoteDebugPorts != null) {
            if (configuredRemoteDebugPorts.size != requiredNumOfPorts) {
                throw RuntimeConfigurationError(
                    message(
                        "cloud_debug.run_configuration.incorrect_number_of_ports",
                        containerName,
                        platform,
                        requiredNumOfPorts,
                        configuredRemoteDebugPorts.size
                    )
                )
            }

            configuredRemoteDebugPorts
        } else {
            val selectedPorts = mutableListOf<Int>()

            for (i in 0..requiredNumOfPorts) {
                var port = DEFAULT_REMOTE_DEBUG_PORT
                while (usedRemoteDebugPorts.contains(port)) {
                    port++
                    if (port > 65535) {
                        throw RuntimeConfigurationError(message("cloud_debug.run_configuration.impressive_number_of_ports", containerName))
                    }
                }
                usedRemoteDebugPorts.add(port)
                selectedPorts.add(port)
            }

            selectedPorts
        }

        val startCommand = containerOptions.startCommand
            ?: throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.start_command", containerName))

        val debugSupport =
            DebuggerSupport.debuggers()[platform] ?: throw RuntimeConfigurationError(message("cloud_debug.run_configuration.bad_runtime", platform))
        val augmentedStartCommand = if (debugSupport.automaticallyAugmentable(startCommand)) {
            debugSupport.augmentStatement(startCommand, remoteDebugPorts, debugSupport.debuggerPath?.getDebuggerEntryPoint() ?: "")
        } else {
            startCommand
        }

        return ImmutableContainerOptions(
            platform,
            augmentedStartCommand,
            remoteDebugPorts,
            containerOptions.artifactMappings.mapNotNull { resolveArtifactMappings(containerName, it) }.toList(),
            containerOptions.portMappings.mapNotNull { resolvePortMappings(containerName, it) }.toList()
        )
    }

    private fun resolveArtifactMappings(
        containerName: String,
        artifactMapping: ArtifactMapping
    ): ImmutableArtifactMapping? {
        // Skip empty entries
        if (artifactMapping.localPath == null && artifactMapping.remotePath == null) {
            return null
        }
        val localPath = artifactMapping.localPath
            ?: throw RuntimeConfigurationError(
                message(
                    "cloud_debug.run_configuration.missing.local_path",
                    containerName
                )
            )

        val remotePath = artifactMapping.remotePath
            ?: throw RuntimeConfigurationError(
                message(
                    "cloud_debug.run_configuration.missing.remote_path",
                    containerName
                )
            )

        return ImmutableArtifactMapping(localPath, remotePath)
    }

    private fun resolvePortMappings(containerName: String, portMapping: PortMapping): ImmutablePortMapping? {
        // Skip empty entries
        if (portMapping.localPort == null && portMapping.remotePort == null) {
            return null
        }
        val localPort = portMapping.localPort
            ?: throw RuntimeConfigurationError(
                message(
                    "cloud_debug.run_configuration.missing.local_port",
                    containerName
                )
            )

        val remotePort = portMapping.remotePort
            ?: throw RuntimeConfigurationError(
                message(
                    "cloud_debug.run_configuration.missing.remote_port",
                    containerName
                )
            )

        return ImmutablePortMapping(localPort, remotePort)
    }

    private companion object {
        val LOG = getLogger<EcsCloudDebugRunConfiguration>()
    }
}
