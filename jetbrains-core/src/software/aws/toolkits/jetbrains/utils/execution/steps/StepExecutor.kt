// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessOutputType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import java.io.OutputStream

/**
 * Executor for a [StepWorkflow]
 */
class StepExecutor(
    project: Project?,
    private val workflow: StepWorkflow,
    private val messageEmitter: WorkflowEmitter
) {
    var onSuccess: ((Context) -> Unit)? = null
    var onError: ((Throwable) -> Unit)? = null

    private val context = Context()
    private val processHandler = StepExecutorProcessHandler(context)

    init {
        project?.let { context.putAttribute(Context.PROJECT_ATTRIBUTE, project) }
    }

    /**
     * Returns a pseudo process handler that coincides with the life cycle of the StepExecutors workflow
     *
     * Can also be used to give the ownership of the lifecycle over to a 3rd party such as a Run Config
     */
    fun getProcessHandler(): ProcessHandler = processHandler

    /**
     * Starts the workflow if not already started
     */
    fun startExecution(): ProcessHandler {
        if (!processHandler.isStartNotified) {
            processHandler.startNotify()
        }

        return processHandler
    }

    fun<T : Any> addContext(key: AttributeBagKey<T>, value: T) = context.putAttribute(key, value)

    private fun startWorkflow() {
        ApplicationManager.getApplication().executeOnPooledThread {
            execute(context, WorkflowEmitterWrapper(messageEmitter), processHandler)
        }
    }

    private fun execute(context: Context, messageEmitter: WorkflowEmitter, processHandler: StepExecutorProcessHandler) {
        try {
            executionStarted()
            workflow.run(context, messageEmitter.createStepEmitter())

            // If the dummy process was cancelled (or any step got cancelled), we need to rethrow the cancel
            context.throwIfCancelled()

            onSuccess?.invoke(context)
            context.complete()
            executionFinishedSuccessfully(processHandler)
        } catch (e: Throwable) {
            context.cancel()
            LOG.tryOrNull("Failed to invoke error callback") {
                onError?.invoke(e)
            }
            executionFinishedExceptionally(processHandler, e)
        }
    }

    private fun executionStarted() {
        LOG.tryOrNull("Failed to invoke error workflowStarted") {
            messageEmitter.workflowStarted()
        }
    }

    private fun executionFinishedSuccessfully(processHandler: StepExecutorProcessHandler) {
        LOG.tryOrNull("Failed to invoke error workflowCompleted") {
            messageEmitter.workflowCompleted()
        }

        processHandler.notifyProcessTerminated(0)
    }

    private fun executionFinishedExceptionally(processHandler: StepExecutorProcessHandler, e: Throwable) {
        LOG.tryOrNull("Failed to invoke error workflowFailed") {
            messageEmitter.workflowFailed(e)
        }

        processHandler.notifyProcessTerminated(1)
    }

    /**
     * Wraps the [WorkflowEmitter] so we can pass messages back to the [ProcessHandler]
     */
    private inner class WorkflowEmitterWrapper(private val delegate: WorkflowEmitter) : WorkflowEmitter by delegate {
        override fun createStepEmitter(): StepEmitter = StepEmitterWrapper(delegate.createStepEmitter())
    }

    /**
     * Wraps the [StepEmitter] so we can pass messages back to the [ProcessHandler]
     */
    private inner class StepEmitterWrapper(private val delegate: StepEmitter) : StepEmitter by delegate {
        override fun createChildEmitter(stepName: String, hidden: Boolean): StepEmitter = StepEmitterWrapper(delegate.createChildEmitter(stepName, hidden))

        override fun emitMessage(message: String, isError: Boolean) {
            if (ApplicationManager.getApplication().isUnitTestMode) {
                print(message)
            }

            delegate.emitMessage(message, isError)
            processHandler.notifyTextAvailable(message, if (isError) ProcessOutputType.STDERR else ProcessOutputType.STDOUT)
        }
    }

    /**
     * Fake process handle that acts as the "wrapper" for all steps. Any cancelled step will "kill" this process and vice versa.
     * For example, in a run config this process handle can be tied to the red Stop button thus stopping it cancels the step execution flow.
     */
    private inner class StepExecutorProcessHandler(private val context: Context) : ProcessHandler() {
        override fun startNotify() {
            startWorkflow()
            super.startNotify()
        }

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

    private companion object {
        val LOG = getLogger<StepExecutor>()
    }
}
