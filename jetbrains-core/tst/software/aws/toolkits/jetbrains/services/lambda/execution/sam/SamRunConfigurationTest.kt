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
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.settings.SamExecutableDetector
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.toElement
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
        assumeTrue(SamExecutableDetector().detect() == null)

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

    @Test
    fun readExternalDoesNotThrowException() {
        val element = """
            <configuration name="[Local] HelloWorldFunction (1)" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
                <option name="credentialProviderId" value="profile:default" />
                <option name="environmentVariables">
                    <map />
                </option>
                <option name="handler" value="helloworld.App::handleRequest" />
            </configuration>
        """.toElement()

        runInEdtAndWait {
            val runConfiguration =
                createRunConfiguration(project = projectRule.project, handler = null)

            runConfiguration.readExternal(element)

            assertThat(runConfiguration.getHandler()).isEqualTo("helloworld.App::handleRequest")
            assertThat(runConfiguration.getEnvironmentVariables()).hasSize(0)
        }
    }

    private fun getState(runConfiguration: SamRunConfiguration): SamRunningState {
        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        return runConfiguration.getState(executor, mock { on { project } doReturn projectRule.project })
    }
}