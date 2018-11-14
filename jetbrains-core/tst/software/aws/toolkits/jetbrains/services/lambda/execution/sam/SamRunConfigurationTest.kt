// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.ExecutionException
import com.intellij.execution.ExecutorRegistry
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
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.testutils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message

class SamRunConfigurationTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val envHelper = EnvironmentVariableHelper()

    @Before
    fun setUp() {
        SamSettings.getInstance().savedExecutablePath = "sam"
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
        SamSettings.getInstance().savedExecutablePath = null
        envHelper.remove("PATH")

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(project = projectRule.project)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("sam.cli_not_configured"))
        }
    }

    @Test
    fun handlerIsNotSet() {
        runInEdtAndWait {
            val runConfiguration =
                createRunConfiguration(project = projectRule.project, handler = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified"))
        }
    }

    @Test
    fun runtimeIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(project = projectRule.project, runtime = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_runtime_specified"))
        }
    }

    @Test
    fun handlerDoesNotExist() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(project = projectRule.project, handler = "Fake")
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", "Fake"))
        }
    }

    @Test
    fun invalidRegion() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(project = projectRule.project, region = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_region_specified"))
        }
    }

    @Test
    fun regionIsAdded() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(project = projectRule.project)
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
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                credentialsProviderId = credentialsProvider.id
            )
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
            val runConfiguration = createRunConfiguration(project = projectRule.project, input = "TestInput")
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInput")
        }
    }

    @Test
    fun inputFileIsResolved() {
        val tempFile = FileUtil.createTempFile("temp", ".json")
        tempFile.writeText("TestInputFile")

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = tempFile.absolutePath,
                inputIsFile = true
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInputFile")
        }
    }

    private fun getState(runConfiguration: SamRunConfiguration): SamRunningState {
        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        return runConfiguration.getState(executor, mock { on { project } doReturn projectRule.project })
    }
}