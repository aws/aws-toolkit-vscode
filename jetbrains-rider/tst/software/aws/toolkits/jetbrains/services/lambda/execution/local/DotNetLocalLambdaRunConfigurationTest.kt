// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import base.AwsReuseSolutionTestBase
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.openapi.project.Project
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.testng.annotations.AfterMethod
import org.testng.annotations.BeforeMethod
import org.testng.annotations.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.resources.message

class DotNetLocalLambdaRunConfigurationTest : AwsReuseSolutionTestBase() {
    override fun getSolutionDirectoryName(): String = "SamHelloWorldApp"

    override val waitForCaches = true

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @BeforeMethod
    fun setUp() {
        val validSam = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson())
        preWarmSamVersionCache(validSam.toString())
        ExecutableManager.getInstance().setExecutablePath(SamExecutable(), validSam)

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @AfterMethod
    fun tearDown() {
        MockCredentialsManager.getInstance().reset()
    }

    @Test
    fun testHandler_ValidHandler() {
        val handler = "HelloWorld::HelloWorld.Function::FunctionHandler"
        preWarmLambdaHandlerValidation(project, handler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                runtime = Runtime.DOTNETCORE3_1,
                credentialsProviderId = mockId,
                handler = handler
            )
            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun testHandler_NonExistingMethodName() {
        val nonExistingHandler = "HelloWorld::HelloWorld.Function::HandlerDoesNoteExist"
        preWarmLambdaHandlerValidation(project, nonExistingHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                runtime = Runtime.DOTNETCORE3_1,
                credentialsProviderId = mockId,
                handler = nonExistingHandler
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", nonExistingHandler))
        }
    }

    @Test
    fun testHandler_NonExistingTypeName() {
        val nonExistingHandler = "HelloWorld::HelloWorld.UnknownFunction::FunctionHandler"
        preWarmLambdaHandlerValidation(project, nonExistingHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                runtime = Runtime.DOTNETCORE3_1,
                credentialsProviderId = mockId,
                handler = nonExistingHandler
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", nonExistingHandler))
        }
    }

    @Test
    fun testHandler_InvalidHandlerString() {
        val invalidHandler = "Fake"
        preWarmLambdaHandlerValidation(project, invalidHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                runtime = Runtime.DOTNETCORE3_1,
                credentialsProviderId = mockId,
                handler = invalidHandler
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", invalidHandler))
        }
    }

    @Test
    fun testHandler_HandlerNotSet() {
        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                project = project,
                runtime = Runtime.DOTNETCORE3_1,
                credentialsProviderId = mockId,
                handler = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified"))
        }
    }

    private fun preWarmLambdaHandlerValidation(project: Project, handler: String) =
        preWarmLambdaHandlerValidation(project, Runtime.DOTNETCORE3_1, handler)
}
