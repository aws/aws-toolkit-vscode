// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import base.AwsReuseSolutionTestBase
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.ide.util.PropertiesComponent
import com.jetbrains.rider.projectView.solutionDirectory
import com.jetbrains.rider.test.scriptingApi.removeAllBreakpoints
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.AfterMethod
import org.testng.annotations.BeforeMethod
import org.testng.annotations.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWaitRider
import software.aws.toolkits.jetbrains.utils.jsonToMap
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.nio.file.Files

class Dotnet50LocalLambdaImageRunConfigurationIntegrationTest :
    DotnetLocalLambdaImageRunConfigurationIntegrationTestBase("ImageLambda5X", LambdaRuntime.DOTNET5_0)

class Dotnet60LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda6X", LambdaRuntime.DOTNET6_0)

class Dotnet60LocalLambdaImageRunConfigurationIntegrationTest :
    DotnetLocalLambdaImageRunConfigurationIntegrationTestBase("ImageLambda6X", LambdaRuntime.DOTNET6_0)

abstract class DotnetLocalLambdaRunConfigurationIntegrationTestBase(private val solutionName: String, private val runtime: LambdaRuntime) :
    AwsReuseSolutionTestBase() {

    override val waitForCaches = false

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")
    private val handler = "EchoLambda::EchoLambda.Function::FunctionHandler"

    private var initialImmediateWindow: Boolean = false

    @BeforeMethod
    fun setUp() {
        // Disable the immediate window due to double release of editor in 203, this issue should be fixed in later Rider versions FIX_WHEN_MIN_IS_211
        initialImmediateWindow = PropertiesComponent.getInstance().getBoolean("debugger.immediate.window.in.watches")
        PropertiesComponent.getInstance().setValue("debugger.immediate.window.in.watches", false, true)

        setSamExecutableFromEnvironment()

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @AfterMethod
    fun tearDown() {
        PropertiesComponent.getInstance().setValue("debugger.immediate.window.in.watches", initialImmediateWindow)
    }

    override fun getSolutionDirectoryName(): String = solutionName

    @Test
    fun samIsExecutedDebugger() {
        setBreakpoint()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)
        assertThat(executeLambda.exitCode).isEqualTo(0)
    }

    @Test
    fun samIsExecuted() {
        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            credentialsProviderId = mockId,
            handler = handler,
            environmentVariables = envVars
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Environment variables are passed")
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Region is set")
            .containsEntry("AWS_REGION", getDefaultRegion().id)
        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Credentials are passed")
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
            // An empty AWS_SESSION_TOKEN is inserted by Samcli/the Lambda runtime as of 1.13.1
            .containsEntry("AWS_SESSION_TOKEN", "")
    }

    @Test
    fun samIsExecutedWithFileInput() {
        val input = Files.createTempFile(tempTestDirectory.toPath(), "tmp", null).also {
            it.writeText("Hello World")
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            input = input.toString(),
            inputIsFile = true,
            credentialsProviderId = mockId,
            handler = handler,
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
    }
}

abstract class DotnetLocalLambdaImageRunConfigurationIntegrationTestBase(private val solutionName: String, private val runtime: LambdaRuntime) :
    AwsReuseSolutionTestBase() {

    override val waitForCaches = false

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    private var initialImmediateWindow: Boolean = false

    @BeforeMethod
    fun setUp() {
        // Disable the immediate window due to double release of editor in 203, this issue should be fixed in later Rider versions FIX_WHEN_MIN_IS_211
        initialImmediateWindow = PropertiesComponent.getInstance().getBoolean("debugger.immediate.window.in.watches")
        PropertiesComponent.getInstance().setValue("debugger.immediate.window.in.watches", false, true)

        setSamExecutableFromEnvironment()

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @AfterMethod(alwaysRun = true)
    fun tearDown() {
        PropertiesComponent.getInstance().setValue("debugger.immediate.window.in.watches", initialImmediateWindow)
        removeAllBreakpoints(project)
    }

    override fun getSolutionDirectoryName(): String = solutionName

    @Test
    fun samIsExecutedImage() {
        val template = "${project.solutionDirectory}/template.yaml"

        val runConfiguration = createTemplateRunConfiguration(
            project = project,
            runtime = runtime,
            templateFile = template,
            logicalId = "HelloWorldFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
            isImage = true
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)

        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Credentials are passed")
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
            // An empty AWS_SESSION_TOKEN is inserted by Samcli/the Lambda runtime as of 1.13.1
            .containsEntry("AWS_SESSION_TOKEN", "")
    }

    @Test
    fun samIsExecutedDebuggerImage() {
        setBreakpoint()

        val template = "${project.solutionDirectory}/template.yaml"

        val runConfiguration = createTemplateRunConfiguration(
            project = project,
            runtime = runtime,
            templateFile = template,
            logicalId = "HelloWorldFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
            isImage = true
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)
        assertThat(executeLambda.exitCode).isEqualTo(0)
    }
}
