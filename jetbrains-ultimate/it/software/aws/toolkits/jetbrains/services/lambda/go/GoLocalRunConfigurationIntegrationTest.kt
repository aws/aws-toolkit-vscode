// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.goide.vgo.VgoTestUtil
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.utils.UltimateTestUtils
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.HeavyGoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addGoModFile
import software.aws.toolkits.jetbrains.utils.samImageRunDebugTest
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment

@RunWith(Parameterized::class)
class GoLocalRunConfigurationIntegrationTest(private val runtime: LambdaRuntime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun parameters(): Collection<Array<LambdaRuntime>> = listOf(
            arrayOf(LambdaRuntime.GO1_X)
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
        UltimateTestUtils.ensureBuiltInServerStarted()

        val fixture = projectRule.fixture

        PsiTestUtil.addModule(projectRule.project, WebModuleTypeBase.getInstance(), "main", fixture.tempDirFixture.findOrCreateDir("."))
        projectRule.fixture.addGoModFile("hello-world")

        // This block does 2 things:
        // 1. sets up vgo support which is required for sam cli
        // 2. Makes VgoDlvPositionConverter#toRemotePath work so we can set breakpoints
        runInEdtAndWait {
            VgoTestUtil.setupVgoIntegration(fixture)
        }

        credentialManager.addCredentials(mockId, mockCreds)
    }

    @Test
    fun sessionCredentialsArePassed() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)

        val mockSessionId = "mockSessionId"
        val mockSessionCreds = AwsSessionCredentials.create("access", "secret", "session")

        MockCredentialsManager.getInstance().addCredentials(mockSessionId, mockSessionCreds)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            handler = "handler",
            credentialsProviderId = mockSessionId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockSessionCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockSessionCreds.secretAccessKey())
            .containsEntry("AWS_SESSION_TOKEN", mockSessionCreds.sessionToken())
    }

    @Test
    fun samIsExecuted() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)

        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            handler = "handler",
            input = "\"${input}\"",
            credentialsProviderId = mockId,
            environmentVariables = envVars
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Region is passed")
            .containsEntry("AWS_REGION", getDefaultRegion().id)
        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Envvars are passed")
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
        assertThat(jsonToMap(executeLambda.stdout))
            .describedAs("Credentials are passed")
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
            // An empty AWS_SESSION_TOKEN is inserted by Samcli/the Lambda runtime as of 1.13.1
            .containsEntry("AWS_SESSION_TOKEN", "")
    }

    @Test
    fun samIsExecutedWithDebugger() {
        // only run this test on > 2020.1. FIX_WHEN_MIN_IS_202
        assumeFalse(ApplicationInfo.getInstance().let { info -> (info.majorVersion == "2020" && info.minorVersionMainPart == "1") })
        projectRule.fixture.addLambdaFile(fileContents)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            handler = "handler",
            input = "\"${input}\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        // TODO checking stdout doesn't work on sam cli 1.18.1
        // assertThat(executeLambda.stdout).contains(input.toUpperCase())

        assertThat(debuggerIsHit.get()).isTrue
    }

    @Test
    fun samIsExecutedImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime",
        sourceFileName = "main.go",
        runtime = runtime,
        mockCredentialsId = mockId,
        input = input,
        expectedOutput = input.toUpperCase()
    )

    @Test
    fun samIsExecutedWithDebuggerImage() {
        // only run this test on > 2020.1
        assumeFalse(ApplicationInfo.getInstance().let { info -> (info.majorVersion == "2020" && info.minorVersionMainPart == "1") })
        samImageRunDebugTest(
            projectRule = projectRule,
            relativePath = "samProjects/image/$runtime",
            sourceFileName = "main.go",
            runtime = runtime,
            mockCredentialsId = mockId,
            input = input,
            // TODO skip this for now because it doesn't work on SAM cli 1.18.1
            expectedOutput = null,
            addBreakpoint = { projectRule.addBreakpoint() }
        )
    }

    private fun jsonToMap(data: String) = jacksonObjectMapper().readValue<Map<String, String>>(data)
    private fun CodeInsightTestFixture.addLambdaFile(contents: String) {
        val psiFile = addFileToProject("hello-world/main.go", contents)

        runInEdtAndWait {
            openFileInEditor(psiFile.virtualFile)
        }
    }
}
