// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.module.ModuleType
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfiguration
import software.aws.toolkits.jetbrains.utils.rules.HeavyGoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addGoModFile
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment

@RunWith(Parameterized::class)
class GoLocalRunConfigurationIntegrationTest(private val runtime: Runtime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun parameters(): Collection<Array<Runtime>> = listOf(
            arrayOf(Runtime.GO1_X)
        )
    }

    @Rule
    @JvmField
    val projectRule = HeavyGoCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    private val input = RuleUtils.randomName()
    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    private val fileContents = """
        package main

        import (
	        "github.com/aws/aws-lambda-go/lambda"
	        "strings"
        )

        func handler(request string) (string, error) {
        	return strings.ToUpper(request), nil
        }

        func main() {
        	lambda.Start(handler)
        }
    """.trimIndent()

    private val envVarsFileContents = """
        package main

        import (
            "github.com/aws/aws-lambda-go/lambda"
	        "os"
	        "strings"
        )

        func handler() (interface{}, error) {
        	entries := map[string]string{}
        	for _, item := range os.Environ() {
	        	entry := strings.Split(item, "=")
        		entries[entry[0]] = entry[1]
        	}
        	return entries, nil
        }

        func main() {
        	lambda.Start(handler)
        }
    """.trimIndent()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        val fixture = projectRule.fixture

        PsiTestUtil.addModule(projectRule.project, ModuleType.EMPTY, "main", fixture.tempDirFixture.findOrCreateDir("."))

        credentialManager.addCredentials(mockId, mockCreds)
    }

    @Test
    fun envVarsArePassed() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)
        projectRule.fixture.addGoModFile("hello-world")

        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "handler",
            credentialsProviderId = mockId,
            environmentVariables = envVars
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
    }

    @Test
    fun regionIsPassed() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)
        projectRule.fixture.addGoModFile("hello-world")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "handler",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_REGION", getDefaultRegion().id)
    }

    @Test
    fun credentialsArePassed() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)
        projectRule.fixture.addGoModFile("hello-world")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "handler",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
            // An empty AWS_SESSION_TOKEN is inserted by Samcli/the Lambda runtime as of 1.13.1
            .containsEntry("AWS_SESSION_TOKEN", "")
    }

    @Test
    fun sessionCredentialsArePassed() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)
        projectRule.fixture.addGoModFile("hello-world")

        val mockSessionId = "mockSessionId"
        val mockSessionCreds = AwsSessionCredentials.create("access", "secret", "session")

        MockCredentialsManager.getInstance().addCredentials(mockSessionId, mockSessionCreds)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "handler",
            credentialsProviderId = mockSessionId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockSessionCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockSessionCreds.secretAccessKey())
            .containsEntry("AWS_SESSION_TOKEN", mockSessionCreds.sessionToken())
    }

    @Test
    fun samIsExecuted() {
        projectRule.fixture.addLambdaFile(fileContents)
        projectRule.fixture.addGoModFile("hello-world")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "handler",
            input = "\"${input}\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains(input.toUpperCase())
    }

    @Test
    fun samIsExecutedWithDebugger() {
        // TODO enable when go debugging is fixed on sam cli public release
        // see: https://github.com/aws/aws-sam-cli/issues/2462
        assumeTrue(false)
        projectRule.fixture.addLambdaFile(fileContents)
        projectRule.fixture.addGoModFile("hello-world")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "handler",
            input = "\"${input}\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfiguration(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains(input.toUpperCase())

        assertThat(debuggerIsHit.get()).isTrue()
    }

    private fun jsonToMap(data: String) = jacksonObjectMapper().readValue<Map<String, String>>(data)
    private fun CodeInsightTestFixture.addLambdaFile(contents: String) {
        val psiFile = addFileToProject("hello-world/main.go", contents)

        runInEdtAndWait {
            openFileInEditor(psiFile.virtualFile)
        }
    }
}
