// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.Output
import com.intellij.execution.OutputListener
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.util.io.FileUtil
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.InvokeRequest
import software.amazon.awssdk.services.lambda.model.InvokeResponse
import software.amazon.awssdk.services.lambda.model.LambdaException
import software.amazon.awssdk.services.lambda.model.LogType
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

class RemoteLambdaExecutionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule { projectRule.project }

    @Before
    fun setUp() {
        MockCredentialsManager.getInstance()
            .addCredentials(CREDENTIAL_ID, AwsBasicCredentials.create("Access", "Secret"))
    }

    @Test
    fun happyCase() {
        val logMessage = "Some Logs"
        val responsePayload = "Hello World"
        val functionError = "Some error"

        val requestCaptor = argumentCaptor<InvokeRequest>()
        mockClientManager.create<LambdaClient>().stub {
            on { invoke(requestCaptor.capture()) } doReturn InvokeResponse.builder()
                .logResult(Base64.getEncoder().encodeToString(logMessage.toByteArray()))
                .payload(SdkBytes.fromString(responsePayload, StandardCharsets.UTF_8))
                .functionError(functionError)
                .build()
        }

        val output = executeLambda()

        val request = requestCaptor.firstValue
        assertThat(request.functionName()).isEqualTo(FUNCTION_NAME)
        assertThat(request.logType()).isEqualTo(LogType.TAIL)

        assertThat(output.stdout).contains(logMessage)
        assertThat(output.stdout).contains(responsePayload)

        assertThat(output.stderr).contains(functionError)
    }

    @Test
    fun inputText() {
        val input = "InputText"

        val requestCaptor = argumentCaptor<InvokeRequest>()
        mockClientManager.create<LambdaClient>().stub {
            on { invoke(requestCaptor.capture()) } doReturn InvokeResponse.builder().build()
        }

        executeLambda(inputText = input)
        val request = requestCaptor.firstValue
        assertThat(request.payload()).isEqualTo(SdkBytes.fromString(input, StandardCharsets.UTF_8))
    }

    @Test
    fun inputFile() {
        val input = "InputText"
        val inputFile = FileUtil.createTempFile("inputFile", "tmp")
        inputFile.writeText(input)

        val requestCaptor = argumentCaptor<InvokeRequest>()
        mockClientManager.create<LambdaClient>().stub {
            on { invoke(requestCaptor.capture()) } doReturn InvokeResponse.builder().build()
        }

        executeLambda(inputText = inputFile.absolutePath, inputFile = true)
        val request = requestCaptor.firstValue
        assertThat(request.payload()).isEqualTo(SdkBytes.fromString(input, StandardCharsets.UTF_8))
    }

    @Test
    fun serviceException() {
        val dummyMessage = "Dummy Exception"
        mockClientManager.create<LambdaClient>().stub {
            on { invoke(any<InvokeRequest>()) } doThrow LambdaException.builder().message(dummyMessage).build()
        }

        val output = executeLambda()

        assertThat(output.stderr).contains(dummyMessage)
    }

    private fun executeLambda(inputText: String = "Input", inputFile: Boolean = false): Output {
        val runConfiguration = createRunConfiguration(
            project = projectRule.project,
            input = inputText,
            inputIsFile = inputFile,
            credentialId = CREDENTIAL_ID,
            functionName = FUNCTION_NAME,
            regionId = MockRegionProvider.US_EAST_1
        )

        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        val executionEnvironment = ExecutionEnvironmentBuilder.create(executor, runConfiguration).build()
        val executionFuture = CompletableFuture<Output>()
        runInEdt {
            executionEnvironment.runner.execute(executionEnvironment) {
                it.processHandler?.addProcessListener(object : OutputListener() {
                    override fun processTerminated(event: ProcessEvent) {
                        super.processTerminated(event)
                        executionFuture.complete(this.output)
                    }
                })
            }
        }

        return executionFuture.get(5, TimeUnit.SECONDS)
    }

    private companion object {
        const val CREDENTIAL_ID = "MockCredentials"
        const val FUNCTION_NAME = "DummyFunction"
    }
}