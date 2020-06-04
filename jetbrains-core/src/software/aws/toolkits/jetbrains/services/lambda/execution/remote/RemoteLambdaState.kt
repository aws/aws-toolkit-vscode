// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.ExecutionResult
import com.intellij.execution.Executor
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.filters.TextConsoleBuilder
import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.psi.search.GlobalSearchScopes
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.LogType
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.utils.formatText
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import java.io.OutputStream
import java.nio.charset.StandardCharsets
import java.util.Base64

class RemoteLambdaState(
    private val environment: ExecutionEnvironment,
    val settings: RemoteLambdaRunSettings
) : RunProfileState {
    private val consoleBuilder: TextConsoleBuilder

    init {
        val project = environment.project
        val searchScope = GlobalSearchScopes.executionScope(project, environment.runProfile)
        consoleBuilder = TextConsoleBuilderFactory.getInstance().createBuilder(project, searchScope)
    }

    override fun execute(executor: Executor, runner: ProgramRunner<*>): ExecutionResult? {
        val lambdaProcess = LambdaProcess()
        val console = consoleBuilder.console
        console.attachToProcess(lambdaProcess)

        ApplicationManager.getApplication().executeOnPooledThread { invokeLambda(lambdaProcess) }

        return DefaultExecutionResult(console, lambdaProcess)
    }

    private inner class LambdaProcess : ProcessHandler() {
        override fun getProcessInput(): OutputStream? = null

        override fun detachIsDefault(): Boolean = true

        override fun detachProcessImpl() {
            notifyProcessDetached()
        }

        override fun destroyProcessImpl() {
            notifyProcessTerminated(0)
        }
    }

    private fun invokeLambda(lambdaProcess: ProcessHandler) {
        val client = AwsClientManager.getInstance(environment.project)
            .getClient<LambdaClient>(settings.credentialProvider, settings.region)
        var result = Result.Succeeded

        lambdaProcess.notifyTextAvailable(
            message("lambda.execute.invoke", settings.functionName) + '\n',
            ProcessOutputTypes.SYSTEM
        )

        try {
            val response = client.invoke {
                it.logType(LogType.TAIL)
                it.payload(SdkBytes.fromUtf8String(settings.input))
                it.functionName(settings.functionName)
            }

            val logs = Base64.getDecoder().decode(response.logResult()).toString(StandardCharsets.UTF_8)
            val resultPayload = response.payload().asString(StandardCharsets.UTF_8)

            runInEdt {
                lambdaProcess.notifyTextAvailable(
                    message("lambda.execute.logs", logs) + '\n',
                    ProcessOutputTypes.STDOUT
                )

                response.functionError()?.let {
                    lambdaProcess.notifyTextAvailable(
                        message("lambda.execute.function_error", it) + '\n',
                        ProcessOutputTypes.STDERR
                    )
                }

                lambdaProcess.notifyTextAvailable(
                    message("lambda.execute.output", formatJson(resultPayload.trim())) + '\n',
                    ProcessOutputTypes.STDOUT
                )

                lambdaProcess.destroyProcess()
            }
        } catch (e: Exception) {
            result = Result.Failed
            runInEdt {
                lambdaProcess.notifyTextAvailable(
                    message("lambda.execute.service_error", e.message ?: "Unknown") + '\n',
                    ProcessOutputTypes.STDERR
                )

                lambdaProcess.destroyProcess()
            }
        } finally {
            LambdaTelemetry.invokeRemote(
                project = environment.project,
                result = result
            )
        }
    }

    private fun formatJson(input: String) = if (input.isNotEmpty() && input.first() == '{' && input.last() == '}') {
        formatText(environment.project, JsonLanguage.INSTANCE, input)
    } else {
        input
    }
}
