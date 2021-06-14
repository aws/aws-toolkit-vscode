// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.AsyncProgramRunner
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise

class RemoteLambdaRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "Remote AWS Lambda"

    override fun canRun(executorId: String, profile: RunProfile): Boolean =
        DefaultRunExecutor.EXECUTOR_ID == executorId && profile is RemoteLambdaRunConfiguration

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val runPromise = AsyncPromise<RunContentDescriptor?>()
        val remoteState = state as RemoteLambdaState
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val executionResult = remoteState.execute(environment.executor, this)
                val builder = RunContentBuilder(executionResult, environment)

                runInEdt(ModalityState.any()) {
                    runPromise.setResult(builder.showRunContent(environment.contentToReuse))
                }
            } catch (e: Exception) {
                runInEdt(ModalityState.any()) {
                    runPromise.setError(e)
                }
            }
        }

        return runPromise
    }
}
