// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution

import com.intellij.build.BuildDescriptor
import com.intellij.build.BuildView
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.ViewManager
import com.intellij.build.events.Failure
import com.intellij.build.events.FailureResult
import com.intellij.build.events.impl.FinishBuildEventImpl
import com.intellij.build.events.impl.StartBuildEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.ExecutionResult
import com.intellij.execution.Executor
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProcessCanceledException
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.RootStep
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.SetUpPortForwarding
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.StopApplications
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsServiceCloudDebuggingRunSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.ClouddebugTelemetry
import software.aws.toolkits.telemetry.Result

class CloudDebugRunState(
    private val environment: ExecutionEnvironment,
    val settings: EcsServiceCloudDebuggingRunSettings
) : RunProfileState {
    override fun execute(executor: Executor?, runner: ProgramRunner<*>): ExecutionResult? {
        val project = environment.project
        val descriptor = DefaultBuildDescriptor(
            runConfigId(),
            message("cloud_debug.execution.title"),
            "/unused/location",
            System.currentTimeMillis()
        )

        val buildView = BuildView(project, descriptor, null, object : ViewManager {
            override fun isConsoleEnabledByDefault() = false

            override fun isBuildContentView() = true
        })

        val rootStep = RootStep(settings, environment)
        val context = Context(project)
        val processHandler = CloudDebugProcessHandler(context)

        ApplicationManager.getApplication().executeOnPooledThread {
            val messageEmitter = DefaultMessageEmitter.createRoot(buildView, runConfigId())
            var result = Result.SUCCEEDED
            try {
                startRunConfiguration(descriptor, buildView)
                rootStep.run(context, messageEmitter)
                finishedSuccessfully(processHandler, buildView)
            } catch (e: Throwable) {
                result = Result.FAILED
                finishedExceptionally(processHandler, buildView, e)
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

    private fun startRunConfiguration(descriptor: BuildDescriptor, buildView: BuildView) {
        @Suppress("DEPRECATION") // TODO: switch to BuildProgressListener(Object, Event)  FIX_WHEN_MIN_IS_192
        buildView.onEvent(StartBuildEventImpl(descriptor, message("cloud_debug.execution.running")))
    }

    private fun finishedSuccessfully(processHandler: CloudDebugProcessHandler, buildView: BuildView) {
        @Suppress("DEPRECATION") // TODO: switch to BuildProgressListener(Object, Event)  FIX_WHEN_MIN_IS_192
        buildView.onEvent(
            FinishBuildEventImpl(
                runConfigId(),
                null,
                System.currentTimeMillis(),
                message("cloud_debug.execution.success"),
                SuccessResultImpl()
            )
        )

        processHandler.notifyProcessTerminated(0)
    }

    private fun finishedExceptionally(processHandler: CloudDebugProcessHandler, buildView: BuildView, e: Throwable) {
        val message = if (e is ProcessCanceledException) {
            message("cloud_debug.execution.cancelled")
        } else {
            message("cloud_debug.execution.failed")
        }

        @Suppress("DEPRECATION") // TODO: switch to BuildProgressListener(Object, Event)  FIX_WHEN_MIN_IS_192
        buildView.onEvent(
            FinishBuildEventImpl(
                runConfigId(),
                null,
                System.currentTimeMillis(),
                message,
                DefaultFailureResult()
            )
        )

        processHandler.notifyProcessTerminated(1)
    }

    private fun runConfigId() = "${environment.runProfile.name}-${environment.executionId}"

    // Empty constructor was not added to FailureResultImpl till 2019.2, implement the interface ourselves to get same behavior
    // TODO FIX_WHEN_MIN_IS_192
    private class DefaultFailureResult : FailureResult {
        override fun getFailures(): List<Failure> = emptyList()
    }

    companion object {
        private val LOG = getLogger<CloudDebugRunState>()
    }
}
