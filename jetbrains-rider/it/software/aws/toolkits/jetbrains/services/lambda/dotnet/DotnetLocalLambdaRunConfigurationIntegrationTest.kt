// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import base.AwsReuseSolutionTestBase
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.application.ApplicationInfo
import com.jetbrains.rider.projectView.solutionDirectory
import org.assertj.core.api.Assertions.assertThat
import org.testng.SkipException
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

class Dotnet31LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda3X", LambdaRuntime.DOTNETCORE3_1) {
    override val disableOn203 = false // At least run one test suite, running more than one will trigger failures
}

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

    protected open val disableOn203 = true

    @BeforeMethod
    fun setUp() {
        setSamExecutableFromEnvironment()

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    override fun getSolutionDirectoryName(): String = solutionName

    @Test
    fun samIsExecutedDebugger() {
        if (disableOn203 && ApplicationInfo.getInstance().build.baselineVersion >= 203) {
            throw SkipException("Test skipped due to double release of editor on 203")
        }

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
        if (ApplicationInfo.getInstance().build.baselineVersion >= 203) {
            throw SkipException("Test skipped due to double release of editor on 203")
        }

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
