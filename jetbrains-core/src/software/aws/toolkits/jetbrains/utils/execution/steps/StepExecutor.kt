// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildDescriptor
import com.intellij.build.BuildProgressListener
import com.intellij.build.BuildViewManager
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishBuildEventImpl
import com.intellij.build.events.impl.StartBuildEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import software.aws.toolkits.resources.message
import java.io.OutputStream

/**
 * Executor for a tree of [Step]
 */
class StepExecutor(
    private val project: Project,
    private val title: String,
    private val rootStep: Step,
    private val uniqueId: String,
    private val progressListener: BuildProgressListener = project.service<BuildViewManager>()
) {
    fun startExecution(): ProcessHandler {
        val context = Context(project)
        val processHandler = DummyProcessHandler(context)
        val descriptor = DefaultBuildDescriptor(
            uniqueId,
            title,
            "/unused/working/directory",
            System.currentTimeMillis()
        )

        val messageEmitter = MessageEmitter.createRoot(progressListener, uniqueId)

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                executionStarted(descriptor, progressListener)
                rootStep.run(context, messageEmitter)
                executionFinishedSuccessfully(descriptor, processHandler, progressListener)
            } catch (e: Throwable) {
                executionFinishedExceptionally(descriptor, processHandler, progressListener, e)
            }
        }

        return processHandler
    }

    private fun executionStarted(descriptor: BuildDescriptor, progressListener: BuildProgressListener) {
        progressListener.onEvent(descriptor, StartBuildEventImpl(descriptor, message("cloud_debug.execution.running")))
    }

    private fun executionFinishedSuccessfully(
        descriptor: BuildDescriptor,
        processHandler: DummyProcessHandler,
        progressListener: BuildProgressListener
    ) {
        progressListener.onEvent(
            descriptor,
            FinishBuildEventImpl(
                uniqueId,
                null,
                System.currentTimeMillis(),
                message("general.execution.success"),
                SuccessResultImpl()
            )
        )

        processHandler.notifyProcessTerminated(0)
    }

    private fun executionFinishedExceptionally(
        descriptor: BuildDescriptor,
        processHandler: DummyProcessHandler,
        progressListener: BuildProgressListener,
        e: Throwable
    ) {
        val message = if (e is ProcessCanceledException) {
            message("general.execution.cancelled")
        } else {
            message("general.execution.failed")
        }

        progressListener.onEvent(
            descriptor,
            FinishBuildEventImpl(
                uniqueId,
                null,
                System.currentTimeMillis(),
                message,
                FailureResultImpl()
            )
        )

        processHandler.notifyProcessTerminated(1)
    }

    /**
     * Fake process handle that acts as the "wrapper" for all steps. Any cancelled step will "kill" this process and vice versa.
     * For example, in a run config this process handle can be tied to the red Stop button thus stopping it cancels the step execution flow.
     */
    private class DummyProcessHandler(private val context: Context) : ProcessHandler() {
        override fun getProcessInput(): OutputStream? = null

        override fun detachIsDefault() = false

        override fun detachProcessImpl() {
            destroyProcessImpl()
        }

        override fun destroyProcessImpl() {
            context.cancel()
        }

        public override fun notifyProcessTerminated(exitCode: Int) {
            super.notifyProcessTerminated(exitCode)
        }
    }
}
