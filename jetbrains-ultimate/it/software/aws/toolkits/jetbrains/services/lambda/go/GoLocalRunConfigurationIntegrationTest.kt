// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.sdk.GoSdk
import com.goide.sdk.GoSdkService
import com.goide.sdk.GoSdkUtil
import com.goide.vgo.VgoTestUtil
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.DisposableRule
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
import software.aws.toolkits.jetbrains.utils.FrameworkTestUtils
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.jsonToMap
import software.aws.toolkits.jetbrains.utils.rules.HeavyGoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addGoModFile
import software.aws.toolkits.jetbrains.utils.rules.compatibleGoForIde
import software.aws.toolkits.jetbrains.utils.rules.ensureCorrectGoVersion
import software.aws.toolkits.jetbrains.utils.rules.runGoModTidy
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

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val input = RuleUtils.randomName()
    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")
    private lateinit var goModFile: VirtualFile

    // language=go
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

    // language=go
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
        FrameworkTestUtils.ensureBuiltInServerStarted()

        val fixture = projectRule.fixture
        fixture.ensureCorrectGoVersion(disposableRule.disposable)

        PsiTestUtil.addModule(projectRule.project, WebModuleTypeBase.getInstance(), "main", fixture.tempDirFixture.findOrCreateDir("."))
        goModFile = projectRule.fixture.addGoModFile("hello-world").virtualFile

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
        runGoModTidy(goModFile)

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
        runGoModTidy(goModFile)

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
    fun samIsExecutedWithFileInput() {
        projectRule.fixture.addLambdaFile(envVarsFileContents)
        runGoModTidy(goModFile)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            handler = "handler",
            input = projectRule.fixture.tempDirFixture.createFile("tmp", "\"${input}\"").canonicalPath!!,
            inputIsFile = true,
            credentialsProviderId = mockId,
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
    }

    @Test
    fun samIsExecutedWithDebugger() {
        projectRule.fixture.addLambdaFile(fileContents)
        runGoModTidy(goModFile)

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
        assertThat(executeLambda.stdout).contains(input.toUpperCase())

        assertThat(debuggerIsHit.get()).isTrue
    }

    @Test
    fun `works when handler is 'main'`() {
        assumeFalse(true) // TODO: fix when new build images are ready
        // fails if [Lambda.findPsiElementsForHandler] finds the handler in the Go standard library
        val sdkDir = GoSdkUtil.suggestSdkDirectory()!!.children.sortedByDescending { it.name }.first().canonicalPath!!
        VfsRootAccess.allowRootAccess(projectRule.project, sdkDir)
        runInEdtAndWait {
            GoSdkService.getInstance(projectRule.project).setSdk(GoSdk.fromHomePath(sdkDir))
        }
        projectRule.fixture.addLambdaFile(fileContents)
        runGoModTidy(goModFile)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            handler = "main",
            input = "\"${input}\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
    }

    @Test
    fun samIsExecutedImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime",
        templatePatches = mapOf("[GoVersion]" to (compatibleGoForIde())),
        sourceFileName = "main.go",
        runtime = runtime,
        mockCredentialsId = mockId,
        input = input,
        expectedOutput = input.toUpperCase()
    )

    @Test
    fun samIsExecutedWithDebuggerImage() {
        samImageRunDebugTest(
            projectRule = projectRule,
            relativePath = "samProjects/image/$runtime",
            templatePatches = mapOf("[GoVersion]" to (compatibleGoForIde())),
            sourceFileName = "main.go",
            runtime = runtime,
            mockCredentialsId = mockId,
            input = input,
            addBreakpoint = { projectRule.addBreakpoint() }
        )
    }

    private fun CodeInsightTestFixture.addLambdaFile(contents: String) {
        val psiFile = addFileToProject("hello-world/main.go", contents)

        runInEdtAndWait {
            openFileInEditor(psiFile.virtualFile)
        }
    }
}
