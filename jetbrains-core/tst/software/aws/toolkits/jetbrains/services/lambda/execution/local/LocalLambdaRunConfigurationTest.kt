// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.PsiDocumentManager
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.utils.getState
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.value
import software.aws.toolkits.jetbrains.utils.xmlElement
import software.aws.toolkits.resources.message
import java.nio.file.Paths

class LocalLambdaRunConfigurationTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val envHelper = EnvironmentVariableHelper()

    @Rule
    @JvmField
    val tempDir = TemporaryFolder()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")
    private val runtime = Runtime.JAVA8
    private val defaultHandler = "com.example.LambdaHandler::handleRequest"

    @Before
    fun setUp() {
        val validSam = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson())
        preWarmSamVersionCache(validSam.toString())
        ExecutableManager.getInstance().setExecutablePath(SamExecutable(), validSam).value

        credentialManager.addCredentials(mockId, mockCreds)

        val fixture = projectRule.fixture
        val module = fixture.addModule("main")
        fixture.addClass(
            module,
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

    @After
    fun tearDown() {
        ExecutableManager.getInstance().removeExecutable(SamExecutable())
    }

    @Test
    fun validConfiguration() {
        val project = projectRule.project
        preWarmLambdaHandlerValidation(project)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                credentialsProviderId = mockId
            )

            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun `Valid image configuration`() {
        setupMinSamImage()
        val project = projectRule.project
        preWarmLambdaHandlerValidation(project)

        val template = createImageTemplate()
        tempDir.newFolder("hello-world")
        tempDir.newFile("hello-world/Dockerfile3")
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                isImage = true,
                credentialsProviderId = mockId,
                templateFile = template,
                runtime = LambdaRuntime.JAVA11,
                logicalId = "SomeFunction"
            )

            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun `Invalid image-based configuration, no runtime set`() {
        setupMinSamImage()
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                isImage = true,
                credentialsProviderId = mockId,
                templateFile = createImageTemplate(),
                logicalId = "SomeFunction",
                runtime = null
            )

            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.image.missing_debugger", "null"))
        }
    }

    @Test
    fun `Invalid image-based configuration, unsupported runtime set`() {
        setupMinSamImage()
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                isImage = true,
                credentialsProviderId = mockId,
                templateFile = createImageTemplate(),
                logicalId = "SomeFunction",
                runtime = null
            )

            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                // "null" comes from runtime UNKNOWN_TO_SDK_VERSION we use since we know it will never be supported
                .hasMessage(message("lambda.image.missing_debugger", "null"))
        }
    }

    @Test
    fun `Invalid configuration, sam version too low for images`() {
        val invalidSam = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getVersionAsJson("1.0.0"))
        preWarmSamVersionCache(invalidSam.toString())
        ExecutableManager.getInstance().setExecutablePath(SamExecutable(), invalidSam).value

        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                isImage = true,
                input = "TestInput",
                inputIsFile = false,
                templateFile = createImageTemplate(),
                logicalId = "SomeFunction",
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.image.sam_version_too_low", "1.0.0", SamCommon.minImageVersion))
        }
    }

    @Test
    fun samIsNotSet() {
        val fakeSamPath = "NotValid"
        ExecutableManager.getInstance().removeExecutable(SamExecutable())
        ExecutableManager.getInstance().setExecutablePath(SamExecutable(), Paths.get(fakeSamPath))
        Thread.sleep(1000)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                credentialsProviderId = mockId
            )

            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("executableCommon.missing_executable", "sam", message("executableCommon.not_installed")))
        }
    }

    @Test
    fun handlerNotSet() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                handler = null,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified"))
        }
    }

    @Test
    fun runtimeIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                runtime = null,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_runtime_specified"))
        }
    }

    @Test
    fun handlerDoesNotExist() {
        val project = projectRule.project
        val invalidHandler = "Fake"
        preWarmLambdaHandlerValidation(project, handler = invalidHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                handler = invalidHandler,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", invalidHandler))
        }
    }

    @Test
    fun templateFileNotSet() {
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = null,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.sam.no_template_specified"))
        }
    }

    @Test
    fun logicalFunctionNotSet() {
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = "test",
                logicalId = null,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.sam.no_function_specified"))
        }
    }

    @Test
    fun templateFileDoesNotExist() {
        runInEdtAndWait {
            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = "IAmFake",
                logicalId = "Function",
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.sam.template_file_not_found"))
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
            }.canonicalPath
            val logicalName = "NotSomeFunction"

            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = template,
                logicalId = logicalName,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.sam.no_such_function", logicalName, FileUtil.normalize(template)))
        }
    }

    @Test
    fun runtimeNotSetInTemplate() {
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
                      Timeout: 900
                    """.trimIndent()
                )
            }.canonicalPath
            val logicalName = "SomeFunction"

            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = template,
                logicalId = logicalName,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("cloudformation.missing_property", "Runtime", logicalName))
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
            }.canonicalPath
            val logicalName = "SomeFunction"

            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = template,
                logicalId = logicalName,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.unsupported_runtime", "FAKE"))
        }
    }

    @Test
    fun unsupportedArchitecture() {
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
                      Architectures:
                        - FAKE
                      Timeout: 900
                    """.trimIndent()
                )
            }.canonicalPath
            val logicalName = "SomeFunction"

            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = template,
                logicalId = logicalName,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.unsupported_architecture", "FAKE"))
        }
    }

    @Test
    fun handlerNotSetInTemplate() {
        runInEdtAndWait {
            val template = tempDir.newFile("template.yaml").also {
                it.writeText(
                    """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Runtime: java8
                      CodeUri: /some/dummy/code/location
                      Timeout: 900
                    """.trimIndent()
                )
            }.canonicalPath
            val logicalName = "SomeFunction"

            val runConfiguration = createTemplateRunConfiguration(
                project = projectRule.project,
                templateFile = template,
                logicalId = logicalName,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified", logicalName, template))
        }
    }

    @Test
    fun invalidRegion() {
        val project = projectRule.project
        preWarmLambdaHandlerValidation(project)
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                region = null,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("configure.validate.no_region_specified"))
        }
    }

    @Test
    fun noCredentials() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                credentialsProviderId = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_credentials_specified"))
        }
    }

    @Test
    fun invalidCredentials() {
        val credentialName = "DNE"
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                credentialsProviderId = credentialName
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.credential_not_found_error", credentialName))
        }
    }

    @Test
    fun inputIsSet() {
        val project = projectRule.project
        preWarmLambdaHandlerValidation(project)
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                credentialsProviderId = mockId,
                input = "{}"
            )
            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun inputTextIsNotSet() {
        val project = projectRule.project

        preWarmLambdaHandlerValidation(project)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                credentialsProviderId = mockId,
                input = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_input_specified"))
        }
    }

    @Test
    fun inputFileDoesNotExist() {
        val project = projectRule.project
        preWarmLambdaHandlerValidation(project)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                input = "DoesNotExist",
                inputIsFile = true,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_input_specified"))
        }
    }

    @Test
    fun inputFileDoeExist() {
        val project = projectRule.project
        val eventFile = projectRule.fixture.addFileToProject("event.json", "TestInputFile")
        preWarmLambdaHandlerValidation(project)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                input = eventFile.virtualFile.path,
                inputIsFile = true,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun inputTextIsResolved() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                input = "TestInput",
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getRunConfigState(runConfiguration).settings.input).isEqualTo("TestInput")
        }
    }

    @Test
    fun inputFileIsResolved() {
        val eventFile = projectRule.fixture.addFileToProject("event.json", "TestInputFile")

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                input = eventFile.virtualFile.path,
                inputIsFile = true,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getRunConfigState(runConfiguration).settings.input).isEqualTo("TestInputFile")
        }
    }

    @Test
    fun inputFileIsSaved() {
        val eventFile = projectRule.fixture.addFileToProject("event.json", "TestInputFile")

        runInEdtAndWait {
            WriteAction.run<Throwable> {
                PsiDocumentManager.getInstance(projectRule.project).getDocument(eventFile)!!.setText("UpdatedTestInputFile")
            }

            assertThat(VfsUtilCore.loadText(eventFile.virtualFile)).isEqualTo("TestInputFile")

            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                input = eventFile.virtualFile.path,
                inputIsFile = true,
                credentialsProviderId = mockId
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getRunConfigState(runConfiguration).settings.input).isEqualTo("UpdatedTestInputFile")
        }
    }

    @Test
    fun readExternalHandlerBasedDoesNotThrowException() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = xmlElement(
            """
            <configuration name="HelloWorldFunction" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
              <option name="credentialProviderId" value="profile:default" />
              <option name="architecture" value="arm64" />
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
              <option name="runtime" value="python3.11" />
              <option name="templateFile" />
              <option name="useTemplate" value="false" />
              <method v="2" />
            </configuration>
        """
        )

        runInEdtAndWait {
            val runConfiguration = samRunConfiguration(projectRule.project)

            runConfiguration.readExternal(element)

            assertThat(runConfiguration.isUsingTemplate()).isFalse()
            assertThat(runConfiguration.templateFile()).isNull()
            assertThat(runConfiguration.logicalId()).isNull()
            assertThat(runConfiguration.handler()).isEqualTo("helloworld.App::handleRequest")
            assertThat(runConfiguration.architecture()).isEqualTo(LambdaArchitecture.ARM64.toString())
            assertThat(runConfiguration.runtime()).isEqualTo(LambdaRuntime.PYTHON3_11)
            assertThat(runConfiguration.environmentVariables()).containsAllEntriesOf(mapOf("Foo" to "Bar"))
            assertThat(runConfiguration.regionId()).isEqualTo("us-west-2")
            assertThat(runConfiguration.credentialProviderId()).isEqualTo("profile:default")
        }
    }

    @Test
    fun readExternalTemplateBasedDoesNotThrowException() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = xmlElement(
            """
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
        """
        )

        runInEdtAndWait {
            val runConfiguration = samRunConfiguration(projectRule.project)

            runConfiguration.readExternal(element)

            assertThat(runConfiguration.isUsingTemplate()).isTrue()
            assertThat(runConfiguration.templateFile()).isEqualTo("template.yaml")
            assertThat(runConfiguration.logicalId()).isEqualTo("HelloWorldFunction")
            assertThat(runConfiguration.handler()).isNull()
            assertThat(runConfiguration.runtime()).isNull()
            assertThat(runConfiguration.environmentVariables()).containsAllEntriesOf(mapOf("Foo" to "Bar"))
            assertThat(runConfiguration.regionId()).isEqualTo("us-west-2")
            assertThat(runConfiguration.credentialProviderId()).isEqualTo("profile:default")
        }
    }

    @Test
    fun readInputFileBasedDoesNotThrowException() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = xmlElement(
            """
                <configuration name="HelloWorldFunction" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
                  <option name="credentialProviderId" value="profile:default" />
                  <option name="environmentVariables">
                    <map>
                      <entry key="Foo" value="Bar" />
                    </map>
                  </option>
                  <option name="handler" />
                  <option name="input" value="event.json" />
                  <option name="inputIsFile" value="true" />
                  <option name="logicalFunctionName" value="HelloWorldFunction" />
                  <option name="regionId" value="us-west-2" />
                  <option name="runtime" />
                  <option name="templateFile" value="template.yaml" />
                  <option name="useTemplate" value="true" />
                  <method v="2" />
                </configuration>
        """
        )

        runInEdtAndWait {
            val runConfiguration = samRunConfiguration(projectRule.project)

            runConfiguration.readExternal(element)

            assertThat(runConfiguration.isUsingInputFile()).isTrue()
            assertThat(runConfiguration.inputSource()).isEqualTo("event.json")
        }
    }

    @Test
    fun readInputTextBasedDoesNotThrowException() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = xmlElement(
            """
                <configuration name="HelloWorldFunction" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
                  <option name="credentialProviderId" value="profile:default" />
                  <option name="environmentVariables">
                    <map>
                      <entry key="Foo" value="Bar" />
                    </map>
                  </option>
                  <option name="handler" />
                  <option name="input" value="{}" />
                  <option name="inputIsFile" value="false" />
                  <option name="logicalFunctionName" value="HelloWorldFunction" />
                  <option name="regionId" value="us-west-2" />
                  <option name="runtime" />
                  <option name="templateFile" value="template.yaml" />
                  <option name="useTemplate" value="true" />
                  <method v="2" />
                </configuration>
        """
        )

        runInEdtAndWait {
            val runConfiguration = samRunConfiguration(projectRule.project)

            runConfiguration.readExternal(element)

            assertThat(runConfiguration.isUsingInputFile()).isFalse()
            assertThat(runConfiguration.inputSource()).isEqualTo("{}")
        }
    }

    @Test
    fun readSamSettings() {
        // This tests for backwards compatibility, data should not be changed except in backwards compatible ways
        val element = xmlElement(
            """
                <configuration name="HelloWorldFunction" type="aws.lambda" factoryName="Local" temporary="true" nameIsGenerated="true">
                  <option name="credentialProviderId" value="profile:default" />
                  <option name="environmentVariables">
                    <map>
                      <entry key="Foo" value="Bar" />
                    </map>
                  </option>
                  <option name="handler" />
                  <option name="input" value="{}" />
                  <option name="inputIsFile" value="false" />
                  <option name="logicalFunctionName" value="HelloWorldFunction" />
                  <option name="regionId" value="us-west-2" />
                  <option name="runtime" />
                  <option name="templateFile" value="template.yaml" />
                  <option name="useTemplate" value="true" />
                  <sam>
                    <option name="buildInContainer" value="true" />
                    <option name="dockerNetwork" value="aws-lambda" />
                    <option name="skipImagePull" value="true" />
                    <option name="additionalBuildArgs" value="--debug" />
                    <option name="additionalLocalArgs" value="--skip-pull-image" />
                  </sam>
                  <method v="2" />
                </configuration>
        """
        )

        runInEdtAndWait {
            val runConfiguration = samRunConfiguration(projectRule.project)

            runConfiguration.readExternal(element)

            assertThat(runConfiguration.skipPullImage).isTrue()
            assertThat(runConfiguration.buildInContainer).isTrue()
            assertThat(runConfiguration.dockerNetwork).isEqualTo("aws-lambda")
            assertThat(runConfiguration.additionalBuildArgs).isEqualTo("--debug")
            assertThat(runConfiguration.additionalLocalArgs).isEqualTo("--skip-pull-image")
        }
    }

    @Test // https://github.com/aws/aws-toolkit-jetbrains/issues/1072
    fun creatingACopyDoesNotAliasFields() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = projectRule.project,
                credentialsProviderId = mockId,
                input = "{}"
            )

            val clonedConfiguration = runConfiguration.clone() as LocalLambdaRunConfiguration
            clonedConfiguration.name = "Cloned"

            clonedConfiguration.useInputText("Changed input")

            assertThat(clonedConfiguration.inputSource()).isNotEqualTo(runConfiguration.inputSource())
        }
    }

    private fun preWarmLambdaHandlerValidation(project: Project, handler: String = defaultHandler) =
        preWarmLambdaHandlerValidation(project, runtime, handler)

    private fun getRunConfigState(runConfiguration: LocalLambdaRunConfiguration) = getState(runConfiguration) as SamRunningState

    private fun createImageTemplate(): String = tempDir.newFile("template.yaml").also {
        it.writeText(
            """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      PackageType: Image
                      Timeout: 900
                    Metadata:
                      DockerTag: v1
                      DockerContext: ./hello-world
                      Dockerfile: Dockerfile3
            """.trimIndent()
        )
    }.canonicalPath

    private fun setupMinSamImage() {
        val validSam = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getVersionAsJson(SamCommon.minImageVersion.toString()))
        preWarmSamVersionCache(validSam.toString())
        ExecutableManager.getInstance().setExecutablePath(SamExecutable(), validSam).value
    }
}
