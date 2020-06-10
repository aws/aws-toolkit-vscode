// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessAdapter
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import org.slf4j.event.Level
import software.aws.toolkits.core.utils.AttributeBag
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.clouddebug.CliOutputParser
import software.aws.toolkits.jetbrains.services.clouddebug.asLogEvent
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.CloudDebugCliValidate
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

abstract class Step {
    protected abstract val stepName: String
    protected open val hidden: Boolean = false

    fun run(context: Context, parentEmitter: MessageEmitter, ignoreCancellation: Boolean = false) {
        if (!ignoreCancellation) {
            context.throwIfCancelled()
        }

        // If we are not hidden, we will create a new factory so that the parent node is correct, else pass the current factory so in effect
        // this node does not exist in the hierarchy
        val stepEmitter = parentEmitter.createChild(stepName, hidden)

        stepEmitter.startStep()
        try {
            execute(context, stepEmitter, ignoreCancellation)

            stepEmitter.finishSuccessfully()
        } catch (e: Throwable) {
            LOG.info(e) { "Step $stepName failed" }
            stepEmitter.finishExceptionally(e)
            throw e
        }
    }

    protected abstract fun execute(
        context: Context,
        messageEmitter: MessageEmitter,
        ignoreCancellation: Boolean
    )

    private companion object {
        val LOG = getLogger<Step>()
    }
}

/**
 * [Step] that creates multiple child steps and runs them in parallel waiting on the result.
 */
abstract class ParallelStep : Step() {
    private inner class ChildStep(val future: CompletableFuture<*>, val step: Step)

    private val listOfChildTasks = mutableListOf<ChildStep>()

    override val hidden = true

    protected abstract fun buildChildSteps(context: Context): List<Step>

    final override fun execute(
        context: Context,
        messageEmitter: MessageEmitter,
        ignoreCancellation: Boolean
    ) {
        buildChildSteps(context).forEach {
            val stepFuture = CompletableFuture<Unit>()
            listOfChildTasks.add(ChildStep(stepFuture, it))

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    it.run(context, messageEmitter, ignoreCancellation)
                    stepFuture.complete(null)
                } catch (e: Throwable) {
                    stepFuture.completeExceptionally(e)
                }
            }
        }

        try {
            CompletableFuture.allOf(*listOfChildTasks.map { it.future }.toTypedArray()).join()
        } catch (e: CompletionException) {
            throw e.cause ?: e
        } catch (e: Throwable) {
            throw e
        }
    }
}

abstract class CliBasedStep : Step() {
    private fun getCli(context: Context): GeneralCommandLine = context.getRequiredAttribute(CloudDebugCliValidate.EXECUTABLE_ATTRIBUTE).getCommandLine()

    protected abstract fun constructCommandLine(context: Context, commandLine: GeneralCommandLine)
    protected abstract fun recordTelemetry(context: Context, startTime: Instant, result: Result)

    final override fun execute(
        context: Context,
        messageEmitter: MessageEmitter,
        ignoreCancellation: Boolean
    ) {
        val startTime = Instant.now()
        var result = Result.Succeeded
        val commandLine = getCli(context)

        constructCommandLine(context, commandLine)
        LOG.debug { "Built command line: ${commandLine.commandLineString}" }

        val processHandler = ProcessHandlerFactory.getInstance().createProcessHandler(commandLine)
        val processCapture = CapturingProcessAdapter()
        processHandler.addProcessListener(processCapture)
        processHandler.addProcessListener(CliOutputEmitter(messageEmitter))
        processHandler.startNotify()

        monitorProcess(processHandler, context, ignoreCancellation)

        try {
            if (!ignoreCancellation) {
                context.throwIfCancelled()
            }

            if (processHandler.exitCode == 0) {
                handleSuccessResult(processCapture.output.stdout, messageEmitter, context)
                return
            }

            try {
                handleErrorResult(processCapture.output.stdout, messageEmitter)
            } catch (e: Exception) {
                result = Result.Failed
                throw e
            }
        } catch (e: ProcessCanceledException) {
            LOG.warn(e) { "Step \"$stepName\" cancelled!" }
            result = Result.Cancelled
        } finally {
            recordTelemetry(context, startTime, result)
        }
    }

    private fun monitorProcess(processHandler: OSProcessHandler, context: Context, ignoreCancellation: Boolean) {
        while (!processHandler.waitFor(WAIT_INTERVAL_MILLIS)) {
            if (!ignoreCancellation && context.isCancelled()) {
                if (!processHandler.isProcessTerminating && !processHandler.isProcessTerminated) {
                    processHandler.destroyProcess()
                }
            }
        }
    }

    protected open fun handleSuccessResult(output: String, messageEmitter: MessageEmitter, context: Context) {
    }

    /**
     * Processes the command's stdout and throws an exception after the CLI exits with failure.
     * @return null if the failure should be ignored. You're probably doing something wrong if you want this.
     */
    protected open fun handleErrorResult(output: String, messageEmitter: MessageEmitter): Nothing? {
        if (output.isNotEmpty()) {
            messageEmitter.emitMessage("Error details:\n", true)
            CliOutputParser.parseErrorOutput(output)?.run {
                errors.forEach {
                    messageEmitter.emitMessage("\t- $it\n", true)
                }
            } ?: messageEmitter.emitMessage(output, true)
        }

        throw IllegalStateException(message("cloud_debug.step.general.cli_error"))
    }

    private class CliOutputEmitter(private val messageEmitter: MessageEmitter) : ProcessAdapter() {
        val previousLevel = AtomicReference<Level>(null)
        override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
            if (outputType == ProcessOutputTypes.STDERR) {
                val logEvent = event.text.replace("\r", "\n").asLogEvent()
                val level = logEvent.level ?: previousLevel.get()
                messageEmitter.emitMessage(logEvent.text, level == Level.ERROR)
                logEvent.level?.let { previousLevel.set(it) }
            }
            // output to the log for diagnostic and integrations tests
            LOG.debug { event.text.trim() }
        }
    }

    companion object {
        private const val WAIT_INTERVAL_MILLIS = 100L
        private val LOG = getLogger<CliBasedStep>()
    }
}

class Context(val project: Project) {
    val workflowToken = UUID.randomUUID().toString()
    private val attributeMap = AttributeBag()
    private val isCancelled: AtomicBoolean = AtomicBoolean(false)

    fun cancel() {
        isCancelled.set(true)
    }

    fun isCancelled() = isCancelled.get()

    fun throwIfCancelled() {
        if (isCancelled()) {
            throw ProcessCanceledException()
        }
    }

    fun <T : Any> getAttribute(key: AttributeBagKey<T>): T? = attributeMap.get(key)

    fun <T : Any> getRequiredAttribute(key: AttributeBagKey<T>): T = attributeMap.getOrThrow(key)

    fun <T : Any> putAttribute(key: AttributeBagKey<T>, data: T) {
        attributeMap.putData(key, data)
    }
}
