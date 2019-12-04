// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import icons.TerminalIcons
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner
import org.jetbrains.plugins.terminal.TerminalTabState
import org.jetbrains.plugins.terminal.TerminalView
import software.amazon.awssdk.services.toolkittelemetry.model.Unit
import software.aws.toolkits.jetbrains.components.telemetry.AnActionWrapper
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.executables.CloudDebugExecutable
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.clouddebug.CliOutputParser
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants.INSTRUMENTED_STATUS
import software.aws.toolkits.jetbrains.services.clouddebug.InstrumentResponse
import software.aws.toolkits.jetbrains.services.clouddebug.resources.CloudDebuggingResources
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.CLOUDDEBUG_TELEMETRY_PREFIX
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.CLOUDDEBUG_VERSION
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.RESULT
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.time.Duration
import java.time.Instant

class StartRemoteShellAction(private val project: Project, private val container: ContainerDetails) : AnActionWrapper(
    message("cloud_debug.ecs.remote_shell.start"),
    icon = TerminalIcons.OpenTerminal_13x13
) {

    private val disabled by lazy {
        !PluginManager.isPluginInstalled(PluginId.findId("org.jetbrains.plugins.terminal")) ||
            // exec doesn't allow you to go into the sidecar container
            container.containerDefinition.name() == CloudDebugConstants.CLOUD_DEBUG_SIDECAR_CONTAINER_NAME ||
            !EcsUtils.isInstrumented(container.service.serviceArn())
    }

    override fun update(e: AnActionEvent) {
        if (disabled) {
            e.presentation.isEnabled = false
            e.presentation.isVisible = false
            return
        }
    }

    override fun doActionPerformed(e: AnActionEvent) {
        val containerName = container.containerDefinition.name()
        val cluster = container.service.clusterArn()
        val service = container.service.serviceArn()
        val title = message("cloud_debug.ecs.remote_shell.start")
        val startTime = Instant.now()

        ExecutableManager.getInstance().getExecutable<CloudDebugExecutable>().thenAccept { cloudDebugExecutable ->
            ProgressManager.getInstance().run(object : Task.Backgroundable(project, title, false) {
                override fun run(indicator: ProgressIndicator) {
                    if (cloudDebugExecutable !is ExecutableInstance.Executable) {
                        runInEdt {
                            notifyError(message("cloud_debug.step.clouddebug.install.fail"))
                        }
                        throw Exception("cloud debug executable not found")
                    }

                    val description = CloudDebuggingResources.describeInstrumentedResource(project, cluster, service)
                    if (description == null || description.status != INSTRUMENTED_STATUS || description.taskRole.isEmpty()) {
                        runInEdt {
                            notifyError(message("cloud_debug.execution.failed.not_set_up"))
                        }
                        throw RuntimeException("Resource somehow became de-instrumented?")
                    }
                    val role = description.taskRole

                    val target = try {
                        runInstrument(project, cloudDebugExecutable, cluster, service, role).target
                    } catch (e: Exception) {
                        e.notifyError(title)
                        null
                    } ?: return

                    val cmdLine = buildBaseCmdLine(project, cloudDebugExecutable)
                        .withParameters("exec")
                        .withParameters("--target")
                        .withParameters(target)
                        /* TODO remove this when the cli conforms to the contract */
                        .withParameters("--selector")
                        .withParameters(containerName)
                        .withParameters("--tty")
                        .withParameters("/aws/cloud-debug/common/busybox", "sh", "-i")

                    val runner = object : LocalTerminalDirectRunner(project) {
                        override fun getCommand(envs: MutableMap<String, String>?) = cmdLine.getCommandLineList(null).toTypedArray()
                    }

                    runInEdt {
                        TerminalView.getInstance(project).createNewSession(runner, TerminalTabState().also { it.myTabName = containerName })
                    }
                }

                override fun onSuccess() {
                    recordTelemetry(TelemetryConstants.TelemetryResult.Succeeded.name)
                }

                override fun onThrowable(error: Throwable) {
                    recordTelemetry(TelemetryConstants.TelemetryResult.Failed.name)
                }

                private fun recordTelemetry(result: String) {
                    TelemetryService.getInstance().record(project) {
                        datum("${CLOUDDEBUG_TELEMETRY_PREFIX}_shell") {
                            createTime(startTime)
                            (cloudDebugExecutable as? ExecutableInstance.Executable)?.version?.let {
                                metadata(CLOUDDEBUG_VERSION, it)
                            }
                            metadata(RESULT, result)
                            unit(Unit.MILLISECONDS)
                            value(Duration.between(startTime, Instant.now()).toMillis().toDouble())
                        }
                    }
                }
            })
        }
    }

    private fun buildBaseCmdLine(project: Project, executable: ExecutableInstance.Executable) = executable.getCommandLine()
        .withEnvironment(project.activeRegion().toEnvironmentVariables())
        .withEnvironment(project.activeCredentialProvider().resolveCredentials().toEnvironmentVariables())

    private fun runInstrument(project: Project, executable: ExecutableInstance.Executable, cluster: String, service: String, role: String): InstrumentResponse {
        // first instrument to grab the instrumentation target and ensure connection
        val instrumentCmd = buildBaseCmdLine(project, executable)
            .withParameters("instrument")
            .withParameters("ecs")
            .withParameters("service")
            .withParameters("--cluster")
            .withParameters(EcsUtils.clusterArnToName(cluster))
            .withParameters("--service")
            .withParameters(EcsUtils.originalServiceName(service))
            .withParameters("--iam-role")
            .withParameters(role)

        return CapturingProcessHandler(instrumentCmd).runProcess().stdout.let {
            CliOutputParser.parseInstrumentResponse(it)
        } ?: throw RuntimeException("CLI provided no response")
    }
}
