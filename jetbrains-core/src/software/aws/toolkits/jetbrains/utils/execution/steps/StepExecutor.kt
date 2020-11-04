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
 * Executor for a [StepWorkflow]
 */
class StepExecutor(
    private val project: Project,
    private val title: String,
    private val workflow: StepWorkflow,
    private val uniqueId: String
) {
    fun startExecution(onSuccess: (Context) -> Unit = {}, onError: (Throwable) -> Unit = {}): ProcessHandler {
        val context = Context(project)
        val processHandler = DummyProcessHandler(context)
        val descriptor = DefaultBuildDescriptor(
            uniqueId,
            title,
            "/unused/working/directory",
            System.currentTimeMillis()
        )
        descriptor.isActivateToolWindowWhenAdded = true

        val progressListener: BuildProgressListener = project.service<BuildViewManager>()
        val messageEmitter = DefaultMessageEmitter.createRoot(progressListener, uniqueId)

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                executionStarted(descriptor, progressListener)
                workflow.run(context, messageEmitter)
                executionFinishedSuccessfully(processHandler, progressListener)
                onSuccess(context)
            } catch (e: Throwable) {
                executionFinishedExceptionally(processHandler, progressListener, e)
                onError(e)
            }
        }

        return processHandler
    }

    private fun executionStarted(descriptor: BuildDescriptor, progressListener: BuildProgressListener) {
        progressListener.onEvent(uniqueId, StartBuildEventImpl(descriptor, message("general.execution.running")))
    }

    private fun executionFinishedSuccessfully(processHandler: DummyProcessHandler, progressListener: BuildProgressListener) {
        progressListener.onEvent(
            uniqueId,
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

    private fun executionFinishedExceptionally(processHandler: DummyProcessHandler, progressListener: BuildProgressListener, e: Throwable) {
        val message = if (e is ProcessCanceledException) {
            message("general.execution.cancelled")
        } else {
            message("general.execution.failed")
        }

        progressListener.onEvent(
            uniqueId,
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
