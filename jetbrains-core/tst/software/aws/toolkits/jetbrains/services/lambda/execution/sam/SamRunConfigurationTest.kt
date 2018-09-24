// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.ExecutionException
import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.RunManager
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.util.io.FileUtil
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.testutils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message

class SamRunConfigurationTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Before
    fun setUp() {
        SamSettings.getInstance().executablePath = "sam"
        MockCredentialsManager.getInstance().reset()

        projectRule.fixture.addClass(
            """
            package com.example;

            public class LambdaHandler {
                public String handleRequest(String request) {
                    return request.toUpperCase();
                }
            }
            """
        )
    }

    @Test
    fun samIsNotSet() {
        SamSettings.getInstance().executablePath = ""

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration()
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.sam.not_specified"))
        }
    }

    @Test
    fun handlerIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(handler = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified"))
        }
    }

    @Test
    fun runtimeIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(runtime = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_runtime_specified"))
        }
    }

    @Test
    fun handlerDoesNotExist() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(handler = "Fake")
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", "Fake"))
        }
    }

    @Test
    fun invalidRegion() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(region = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_region_specified"))
        }
    }

    @Test
    fun regionIsAdded() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration()
            assertThat(runConfiguration).isNotNull
            val environmentVariables = getState(runConfiguration).settings.environmentVariables
            assertThat(environmentVariables)
                .containsEntry("AWS_REGION", "us-east-1")
                .containsEntry("AWS_DEFAULT_REGION", "us-east-1")
        }
    }

    @Test
    fun credentialsGetAdded() {
        val awsCredentials = AwsSessionCredentials.create("Access", "Secret", "Session")
        val credentialsProvider = MockCredentialsManager.getInstance().addCredentials("SomeId", awsCredentials)

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(credentialsProviderId = credentialsProvider.id)
            assertThat(runConfiguration).isNotNull
            val environmentVariables = getState(runConfiguration).settings.environmentVariables
            assertThat(environmentVariables)
                .containsEntry("AWS_ACCESS_KEY", awsCredentials.accessKeyId())
                .containsEntry("AWS_ACCESS_KEY_ID", awsCredentials.accessKeyId())
                .containsEntry("AWS_SECRET_KEY", awsCredentials.secretAccessKey())
                .containsEntry("AWS_SECRET_ACCESS_KEY", awsCredentials.secretAccessKey())
                .containsEntry("AWS_SESSION_TOKEN", awsCredentials.sessionToken())
                .containsEntry("AWS_SECURITY_TOKEN", awsCredentials.sessionToken())
        }
    }

    @Test
    fun inputTextIsResolved() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(input = "TestInput")
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInput")
        }
    }

    @Test
    fun inputFileIsResolved() {
        val tempFile = FileUtil.createTempFile("temp", ".json")
        tempFile.writeText("TestInputFile")

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(input = tempFile.absolutePath, inputIsFile = true)
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInputFile")
        }
    }

    private fun createRunConfiguration(
        runtime: Runtime? = Runtime.JAVA8,
        handler: String? = "com.example.LambdaHandler::handleRequest",
        input: String? = "inputText",
        inputIsFile: Boolean = false,
        credentialsProviderId: String? = null,
        region: AwsRegion? = AwsRegion("us-east-1", "us-east-1")
    ): SamRunConfiguration {
        val runManager = RunManager.getInstance(projectRule.project)
        val topLevelFactory = runManager.configurationFactories.first { it is LambdaRunConfiguration }
        val factory = topLevelFactory.configurationFactories.first { it is SamRunConfigurationFactory }
        val runConfigurationAndSettings = runManager.createRunConfiguration("Test", factory)
        val runConfiguration = runConfigurationAndSettings.configuration as SamRunConfiguration
        runManager.addConfiguration(runConfigurationAndSettings)

        runConfiguration.configure(runtime, handler, input, inputIsFile, mutableMapOf(), credentialsProviderId, region)

        return runConfiguration
    }

    private fun getState(runConfiguration: SamRunConfiguration): SamRunningState {
        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        return runConfiguration.getState(executor, mock { on { project } doReturn projectRule.project })
    }
}