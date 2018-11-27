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
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.services.lambda.model.Runtime
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

    @Rule
    @JvmField
    val tempDir = TemporaryFolder()

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
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("sam.cli_not_configured"))
        }
    }

    @Test
    fun handlerIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, handler = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified"))
        }
    }

    @Test
    fun runtimeIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, runtime = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_runtime_specified"))
        }
    }

    @Test
    fun handlerDoesNotExist() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, handler = "Fake")
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", "Fake"))
        }
    }

    @Test
    fun templateFileNotSet() {
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(project = projectRule.project, templateFile = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.sam.no_template_specified"))
        }
    }

    @Test
    fun logicalFunctionNotSet() {
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(project = projectRule.project, templateFile = "test", logicalFunctionName = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.sam.no_function_specified"))
        }
    }

    @Test
    fun functionDoesNotExist() {
        runInEdtAndWait {
            val template = tempDir.newFile("template.yaml").also {
                it.writeText(
                    """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      CodeUri: /some/dummy/code/location
                      Runtime: java8
                      Timeout: 900
                """.trimIndent()
                )
            }.absolutePath
            val logicalName = "NotSomeFunction"

            val runConfiguration = createTemplateRunConfiguration(project = projectRule.project, templateFile = template, logicalFunctionName = logicalName)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.sam.no_such_function", logicalName, template))
        }
    }

    @Test
    fun unsupportedRuntime() {
        runInEdtAndWait {
            val template = tempDir.newFile("template.yaml").also {
                it.writeText(
                    """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      CodeUri: /some/dummy/code/location
                      Runtime: FAKE
                      Timeout: 900
                """.trimIndent()
                )
            }.absolutePath
            val logicalName = "SomeFunction"

            val runConfiguration = createTemplateRunConfiguration(project = projectRule.project, templateFile = template, logicalFunctionName = logicalName)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_runtime_specified", logicalName, template))
        }
    }

    @Test
    fun invalidRegion() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, region = null)
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { getState(runConfiguration) }
                .isInstanceOf(ExecutionException::class.java)
                .hasMessage(message("lambda.run_configuration.no_region_specified"))
        }
    }

    @Test
    fun inputTextIsResolved() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, input = "TestInput")
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInput")
        }
    }

    @Test
    fun inputFileIsResolved() {
        val tempFile = FileUtil.createTempFile("temp", ".json")
        tempFile.writeText("TestInputFile")

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                input = tempFile.absolutePath,
                inputIsFile = true
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInputFile")
        }
    }

    @Test
    fun readExternalHandlerBasedDoesNotThrowException() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = """
            <configuration name="HelloWorldFunction" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
              <option name="credentialProviderId" value="profile:default" />
              <option name="environmentVariables">
                <map>
                  <entry key="Foo" value="Bar" />
                </map>
              </option>
              <option name="handler" value="helloworld.App::handleRequest" />
              <option name="input" value="&quot;&quot;" />
              <option name="inputIsFile" value="false" />
              <option name="logicalFunctionName" />
              <option name="regionId" value="us-west-2" />
              <option name="runtime" value="python3.6" />
              <option name="templateFile" />
              <option name="useTemplate" value="false" />
              <method v="2" />
            </configuration>
        """.toElement()

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, handler = null)

            runConfiguration.readExternal(element)

            val settings = runConfiguration.settings()
            assertThat(settings.useTemplate).isFalse()
            assertThat(settings.handler).isEqualTo("helloworld.App::handleRequest")
            assertThat(settings.runtime).isEqualTo(Runtime.PYTHON3_6.toString())
            assertThat(settings.environmentVariables).containsAllEntriesOf(mapOf("Foo" to "Bar"))
            assertThat(settings.regionId).isEqualTo("us-west-2")
            assertThat(settings.credentialProviderId).isEqualTo("profile:default")
            assertThat(settings.templateFile).isNull()
            assertThat(settings.logicalFunctionName).isNull()
        }
    }

    @Test
    fun readExternalTemplateBasedDoesNotThrowException() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = """
                <configuration name="HelloWorldFunction" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
                  <option name="credentialProviderId" value="profile:default" />
                  <option name="environmentVariables">
                    <map>
                      <entry key="Foo" value="Bar" />
                    </map>
                  </option>
                  <option name="handler" />
                  <option name="input" value="&quot;&quot;" />
                  <option name="inputIsFile" value="false" />
                  <option name="logicalFunctionName" value="HelloWorldFunction" />
                  <option name="regionId" value="us-west-2" />
                  <option name="runtime" />
                  <option name="templateFile" value="template.yaml" />
                  <option name="useTemplate" value="true" />
                  <method v="2" />
                </configuration>
        """.toElement()

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(project = projectRule.project, handler = null)

            runConfiguration.readExternal(element)

            val settings = runConfiguration.settings()
            assertThat(settings.useTemplate).isTrue()
            assertThat(settings.handler).isNull()
            assertThat(settings.runtime).isNull()
            assertThat(settings.environmentVariables).containsAllEntriesOf(mapOf("Foo" to "Bar"))
            assertThat(settings.regionId).isEqualTo("us-west-2")
            assertThat(settings.credentialProviderId).isEqualTo("profile:default")
            assertThat(settings.templateFile).isEqualTo("template.yaml")
            assertThat(settings.logicalFunctionName).isEqualTo("HelloWorldFunction")
        }
    }

    private fun getState(runConfiguration: SamRunConfiguration): SamRunningState {
        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        return runConfiguration.getState(executor, mock { on { project } doReturn projectRule.project })
    }
}