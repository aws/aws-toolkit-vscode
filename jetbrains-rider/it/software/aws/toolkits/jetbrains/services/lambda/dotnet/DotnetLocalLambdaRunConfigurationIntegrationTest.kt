// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import base.AwsReuseSolutionTestBase
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.executors.DefaultDebugExecutor
import com.jetbrains.rider.projectView.solutionDirectory
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.BeforeMethod
import org.testng.annotations.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWaitRider
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment

class Dotnet21LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda2X", LambdaRuntime.DOTNETCORE2_1)
class Dotnet21LocalLambdaImageRunConfigurationIntegrationTest :
    DotnetLocalLambdaImageRunConfigurationIntegrationTestBase("ImageLambda2X", LambdaRuntime.DOTNETCORE2_1)

class Dotnet31LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda3X", LambdaRuntime.DOTNETCORE3_1)
class Dotnet31LocalLambdaImageRunConfigurationIntegrationTest :
    DotnetLocalLambdaImageRunConfigurationIntegrationTestBase("ImageLambda3X", LambdaRuntime.DOTNETCORE3_1)

class Dotnet50LocalLambdaImageRunConfigurationIntegrationTest :
    DotnetLocalLambdaImageRunConfigurationIntegrationTestBase("ImageLambda5X", LambdaRuntime.DOTNET5_0)

abstract class DotnetLocalLambdaRunConfigurationIntegrationTestBase(private val solutionName: String, private val runtime: LambdaRuntime) :
    AwsReuseSolutionTestBase() {

    override val waitForCaches = false

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")
    private val handler = "EchoLambda::EchoLambda.Function::FunctionHandler"

    @BeforeMethod
    fun setUp() {
        setSamExecutableFromEnvironment()

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    override fun getSolutionDirectoryName(): String = solutionName

    @Test
    fun samIsExecuted() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
    }

    @Test
    fun samIsExecutedDebugger() {
        setBreakpoint()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            credentialsProviderId = mockId,
            handler = handler
        )

        val debuggerIsHit = checkBreakPointHit(project)

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(debuggerIsHit.get()).isTrue
    }

    @Test
    fun envVarsArePassed() {
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
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
    }

    @Test
    fun regionIsPassed() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_REGION", getDefaultRegion().id)
    }

    @Test
    fun credentialsArePassed() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime.toSdkRuntime(),
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
    }

    private fun jsonToMap(data: String) = jacksonObjectMapper().readValue<Map<String, Any>>(data)
}

abstract class DotnetLocalLambdaImageRunConfigurationIntegrationTestBase(private val solutionName: String, private val runtime: LambdaRuntime) :
    AwsReuseSolutionTestBase() {

    override val waitForCaches = false

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @BeforeMethod
    fun setUp() {
        setSamExecutableFromEnvironment()

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
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

        val debuggerIsHit = checkBreakPointHit(project)

        val executeLambda = executeRunConfigurationAndWaitRider(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(debuggerIsHit.get()).isTrue
    }
}
