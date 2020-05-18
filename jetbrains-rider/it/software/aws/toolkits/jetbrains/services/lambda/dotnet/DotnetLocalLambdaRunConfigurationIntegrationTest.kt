// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import base.AwsReuseSolutionTestBase
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.jetbrains.rider.test.annotations.TestEnvironment
import org.assertj.core.api.Assertions.assertThat
import org.testng.annotations.BeforeMethod
import org.testng.annotations.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.utils.executeRunConfiguration
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment

class Dotnet21LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda2X", Runtime.DOTNETCORE2_1)
// TODO: Fix test not running on CodeBuild
// class Dotnet31LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda3X", Runtime.DOTNETCORE3_1)

abstract class DotnetLocalLambdaRunConfigurationIntegrationTestBase(private val solutionName: String, private val runtime: Runtime) :
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
    @TestEnvironment(solution = "EchoLambda")
    fun samIsExecuted() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime,
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfiguration(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
    }

    @Test
    @TestEnvironment(solution = "EchoLambda")
    fun envVarsArePassed() {
        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime,
            credentialsProviderId = mockId,
            handler = handler,
            environmentVariables = envVars
        )

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
    }

    @Test
    @TestEnvironment(solution = "EchoLambda")
    fun regionIsPassed() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime,
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_REGION", MockRegionProvider.getInstance().defaultRegion().id)
    }

    @Test
    @TestEnvironment(solution = "EchoLambda")
    fun credentialsArePassed() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime,
            credentialsProviderId = mockId,
            handler = handler
        )

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
    }

    private fun jsonToMap(data: String) = jacksonObjectMapper().readValue<Map<String, Any>>(data)
}
