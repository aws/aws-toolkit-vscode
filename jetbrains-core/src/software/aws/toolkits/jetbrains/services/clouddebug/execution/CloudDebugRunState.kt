// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution

import com.intellij.build.BuildView
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.ViewManager
import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.ExecutionResult
import com.intellij.execution.Executor
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.openapi.application.ApplicationManager
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.CloudDebugWorkflow
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.SetUpPortForwarding
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.StopApplications
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.jetbrains.utils.execution.steps.BuildViewWorkflowEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result

class CloudDebugRunState(
    private val environment: ExecutionEnvironment,
    val settings: EcsServiceCloudDebuggingRunSettings
) : RunProfileState {
    override fun execute(executor: Executor?, runner: ProgramRunner<*>): ExecutionResult {
        val project = environment.project
        val descriptor = DefaultBuildDescriptor(
            runConfigId(),
            message("cloud_debug.execution.title"),
            "/unused/location",
            System.currentTimeMillis()
        )

        val buildView = BuildView(
            project,
            descriptor,
            null,
            object : ViewManager {
                override fun isConsoleEnabledByDefault() = false

                override fun isBuildContentView() = true
            }
        )

        val workflowEmitter = BuildViewWorkflowEmitter.createEmitter(
            buildView,
            message("cloud_debug.execution.title"),
            runConfigId()
        )

        val rootStep = CloudDebugWorkflow(settings, environment)
        val context = Context()
        context.putAttribute(Context.PROJECT_ATTRIBUTE, project)
        val processHandler = CloudDebugProcessHandler(context)

        ApplicationManager.getApplication().executeOnPooledThread {
            val messageEmitter = workflowEmitter.createStepEmitter()
            var result = Result.Succeeded
            try {
                workflowEmitter.workflowStarted()
                rootStep.run(context, messageEmitter)
                workflowEmitter.workflowCompleted()
            } catch (e: Throwable) {
                result = Result.Failed
                workflowEmitter.workflowFailed(e)
            }

            try {
                StopApplications(settings, isCleanup = true).run(context, messageEmitter, ignoreCancellation = true)
            } catch (e: Exception) {
                LOG.info(e) { "Always-run stopping applications step failed with message]: ${e.message}" }
            }

            try {
                SetUpPortForwarding(settings, enable = false).run(context, messageEmitter, ignoreCancellation = true)
            } catch (e: Exception) {
                LOG.info(e) { "Always-run stopping port forwarding failed with: ${e.message}" }
            }

            ClouddebugTelemetry.startRemoteDebug(project, result, context.workflowToken)
        }

        return DefaultExecutionResult(buildView, processHandler)
    }

    private fun runConfigId() = "${environment.runProfile.name}-${environment.executionId}"

    companion object {
        private val LOG = getLogger<CloudDebugRunState>()
    }
}
