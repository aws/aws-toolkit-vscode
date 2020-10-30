// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.execution.steps

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessAdapter
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.util.Key
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.telemetry.Result
import java.time.Instant

abstract class CliBasedStep : Step() {
    protected abstract fun constructCommandLine(context: Context): GeneralCommandLine
    protected open fun recordTelemetry(context: Context, startTime: Instant, result: Result) {}

    final override fun execute(
        context: Context,
        messageEmitter: MessageEmitter,
        ignoreCancellation: Boolean
    ) {
        val startTime = Instant.now()
        var result = Result.Succeeded
        val commandLine = constructCommandLine(context)

        LOG.debug { "Built command line: ${commandLine.commandLineString}" }

        val processHandler = ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
        val processCapture = CapturingProcessAdapter()
        processHandler.addProcessListener(processCapture)
        processHandler.addProcessListener(createProcessEmitter(messageEmitter))
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

    protected open fun createProcessEmitter(messageEmitter: MessageEmitter): ProcessListener = CliOutputEmitter(messageEmitter)

    private class CliOutputEmitter(private val messageEmitter: MessageEmitter) : ProcessAdapter() {
        override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
            messageEmitter.emitMessage(event.text, outputType == ProcessOutputTypes.STDERR)
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

    protected abstract fun handleSuccessResult(output: String, messageEmitter: MessageEmitter, context: Context)

    /**
     * Processes the command's stdout and throws an exception after the CLI exits with failure.
     * @return null if the failure should be ignored. You're probably doing something wrong if you want this.
     */
    protected abstract fun handleErrorResult(output: String, messageEmitter: MessageEmitter): Nothing?

    private companion object {
        const val WAIT_INTERVAL_MILLIS = 100L
        private val LOG = getLogger<CliBasedStep>()
    }
}
