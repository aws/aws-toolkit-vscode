// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ExpirableExecutor
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.util.concurrency.AppExecutorUtil
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message

open class SamRunner(protected val settings: LocalLambdaRunSettings) {
    open fun patchCommandLine(commandLine: GeneralCommandLine) {}

    open fun run(environment: ExecutionEnvironment, state: SamRunningState): Promise<RunContentDescriptor> {
        val promise = AsyncPromise<RunContentDescriptor>()

        // Rider runs unit tests on EDT. That should be no issue, but it means that if we go off EDT (like say
        // with this ApplicationThreadPoolScope.launch here, then attempt to go back onto EDT, we deadlock. So, as much
        // as I dislike doing this, we need to actually detect if we are running unit tests or not so that we
        // can test Rider
        if (!ApplicationManager.getApplication().isUnitTestMode) {
            val bgContext = ExpirableExecutor.on(AppExecutorUtil.getAppExecutorService()).expireWith(environment).coroutineDispatchingContext()
            ApplicationThreadPoolScope(environment.runProfile.name).launch(bgContext) {
                runInternal(promise, environment, state)
            }
        } else {
            runBlocking {
                runInternal(promise, environment, state)
            }
        }

        return promise
    }

    private suspend fun runInternal(promise: AsyncPromise<RunContentDescriptor>, environment: ExecutionEnvironment, state: SamRunningState) {
        val edtContext = getCoroutineUiContext(ModalityState.any(), environment)
        try {
            // `execute` needs to be run in the background because it can resolve credentials
            val executionResult = state.execute(environment.executor, environment.runner)
            withContext(edtContext) {
                val runContent = RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse)
                promise.setResult(runContent)
            }
        } catch (e: Throwable) {
            withContext(edtContext) {
                promise.setError(e)
            }
        }
    }

    /*
     * Assert that Docker is installed. If it is not, throw an exception.
     */
    fun checkDockerInstalled() {
        try {
            val processHandler = OSProcessHandler(GeneralCommandLine("docker", "ps"))
            processHandler.startNotify()
            processHandler.waitFor()
            val exitValue = processHandler.exitCode
            if (exitValue != 0) {
                throw Exception(message("lambda.debug.docker.not_connected"))
            }
        } catch (t: Throwable) {
            throw Exception(message("lambda.debug.docker.not_connected"), t)
        }
    }
}
