// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.build.BuildDescriptor
import com.intellij.build.BuildProgressListener
import com.intellij.build.BuildViewManager
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishBuildEventImpl
import com.intellij.build.events.impl.OutputBuildEventImpl
import com.intellij.build.events.impl.SkippedResultImpl
import com.intellij.build.events.impl.StartBuildEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.build.process.BuildProcessHandler
import com.intellij.execution.Output
import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.resources.message
import java.io.OutputStream

/**
 * Executor for a [StepWorkflow]
 */
class StepExecutor(
    private val project: Project,
    private val title: String,
    private val workflow: StepWorkflow,
    private val uniqueId: String,
    private val progressListener: BuildProgressListener = project.service<BuildViewManager>()
) {
    var onSuccess: ((Context) -> Unit)? = null
    var onError: ((Throwable) -> Unit)? = null

    private val context = Context(project)
    private val processHandler = StepExecutorProcessHandler(title, context)

    /**
     * Returns a pseudo process handler that coincides with the life cycle of the StepExecutors workflow
     *
     * Can also be used to give the ownership of the lifecycle over to a 3rd party such as a Run Config
     */
    fun getProcessHandler() = processHandler

    /**
     * Starts the workflow if not already started
     */
    fun startExecution(): ProcessHandler {
        if (!processHandler.isStartNotified) {
            processHandler.startNotify()
        }

        return processHandler
    }

    private fun startWorkflow() {
        val descriptor = DefaultBuildDescriptor(
            uniqueId,
            title,
            "/unused/working/directory",
            System.currentTimeMillis()
        ).apply {
            isActivateToolWindowWhenAdded = true
            withProcessHandler(processHandler, null)
        }

        // TODO add optional filters and use descriptor.withExecutionFilter for deploy instead of using pop up notification
        val messageEmitter = DefaultMessageEmitter.createRoot(listOf(progressListener, processHandler.buildProgressListener), uniqueId)

        ApplicationManager.getApplication().executeOnPooledThread {
            execute(descriptor, progressListener, context, messageEmitter, processHandler)
        }
    }

    private fun execute(
        descriptor: DefaultBuildDescriptor,
        progressListener: BuildProgressListener,
        context: Context,
        messageEmitter: MessageEmitter,
        processHandler: StepExecutorProcessHandler
    ) {
        try {
            executionStarted(descriptor, progressListener)
            workflow.run(context, messageEmitter)

            // If the dummy process was cancelled (or any step got cancelled), we need to rethrow the cancel
            context.throwIfCancelled()

            onSuccess?.invoke(context)
            context.complete()
            executionFinishedSuccessfully(processHandler, progressListener)
        } catch (e: Throwable) {
            context.cancel()
            LOG.tryOrNull("Failed to invoke error callback") {
                onError?.invoke(e)
            }
            executionFinishedExceptionally(processHandler, progressListener, e)
        }
    }

    private fun executionStarted(descriptor: BuildDescriptor, progressListener: BuildProgressListener) {
        progressListener.onEvent(uniqueId, StartBuildEventImpl(descriptor, message("general.execution.running")))
    }

    private fun executionFinishedSuccessfully(processHandler: StepExecutorProcessHandler, progressListener: BuildProgressListener) {
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

    private fun executionFinishedExceptionally(processHandler: StepExecutorProcessHandler, progressListener: BuildProgressListener, e: Throwable) {
        val message = if (e is ProcessCanceledException) {
            message("general.execution.canceled")
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
                if (e is ProcessCanceledException) SkippedResultImpl() else FailureResultImpl()
            )
        )

        processHandler.notifyProcessTerminated(1)
    }

    /**
     * Fake process handle that acts as the "wrapper" for all steps. Any cancelled step will "kill" this process and vice versa.
     * For example, in a run config this process handle can be tied to the red Stop button thus stopping it cancels the step execution flow.
     */
    inner class StepExecutorProcessHandler(private val title: String, private val context: Context) : BuildProcessHandler() {
        // build progress listener for tests
        private val err = StringBuilder()
        private val out = StringBuilder()

        val buildProgressListener = BuildProgressListener { _, event ->
            if (event is OutputBuildEventImpl && !event.isStdOut) {
                err.append(event.message)
            } else {
                out.append(event.message)
            }
        }

        override fun startNotify() {
            startWorkflow()
            super.startNotify()
        }

        @TestOnly
        fun getFinalOutput(): Output = Output(out.toString(), err.toString(), exitCode ?: -1)

        override fun getProcessInput(): OutputStream? = null

        override fun getExecutionName(): String = title

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

    private companion object {
        val LOG = getLogger<StepExecutor>()
    }
}
