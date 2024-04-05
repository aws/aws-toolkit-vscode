// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.jsonToMap
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addBreakpoint
import software.aws.toolkits.jetbrains.utils.samImageRunDebugTest
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import software.aws.toolkits.jetbrains.utils.stopOnPause

@RunWith(Parameterized::class)
class PythonLocalLambdaRunConfigurationIntegrationTest(private val runtime: Runtime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data(): Collection<Array<Runtime>> = listOf(
            arrayOf(Runtime.PYTHON3_8),
            arrayOf(Runtime.PYTHON3_9),
            arrayOf(Runtime.PYTHON3_10),
            arrayOf(Runtime.PYTHON3_11),
            arrayOf(Runtime.PYTHON3_12),
        )
    }

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")
    private val input = RuleUtils.randomName()
    private lateinit var lambdaClass: PsiFile

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        val fixture = projectRule.fixture
        fixture.addFileToProject(
            "src/hello_world/__init__.py",
            ""
        )

        lambdaClass = fixture.addFileToProject(
            "src/hello_world/app.py",
            """
            import os
            import time

            def lambda_handler(event, context):
                print(os.environ)
                return "Hello world"

            def env_print(event, context):
                return dict(**os.environ)
                
            def run_forever(event, context):
                print(os.environ)
                while true:
                   time.sleep(1)
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(lambdaClass.virtualFile)
        }

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @After
    fun tearDown() {
        MockCredentialsManager.getInstance().reset()
    }

    @Test
    fun samIsExecutedWithContainer() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val samOptions = SamOptions().apply {
            this.buildInContainer = true
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.lambda_handler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
            samOptions = samOptions
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")
    }

    @Test
    fun samIsExecuted() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.env_print",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
            environmentVariables = envVars
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

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
    fun fileContentsAreSavedBeforeRunning() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val randomString = aString()
        runInEdtAndWait {
            WriteCommandAction.runWriteCommandAction(projectRule.project) {
                val document = FileDocumentManager.getInstance().getDocument(lambdaClass.virtualFile)!!
                document.replaceString(
                    0,
                    document.textLength,
                    """
                    def print_string(event, context):
                        return "$randomString"
                    """.trimIndent()
                )
                PsiDocumentManager.getInstance(projectRule.project).commitDocument(document)
            }
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.print_string",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout)
            .describedAs("Random string is printed")
            .contains(randomString)
    }

    @Test
    fun samIsExecutedWithFileInput() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.env_print",
            input = projectRule.fixture.tempDirFixture.createFile("tmp", "Hello World").canonicalPath!!,
            inputIsFile = true,
            credentialsProviderId = mockId,
            environmentVariables = envVars
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
    }

    @Test
    fun sessionCredentialsArePassed() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val mockSessionId = "mockSessionId"
        val mockSessionCreds = AwsSessionCredentials.create("access", "secret", "session")

        MockCredentialsManager.getInstance().addCredentials(mockSessionId, mockSessionCreds)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.env_print",
            input = "\"Hello World\"",
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
    fun samIsExecutedWithDebugger() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.lambda_handler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedWithDebuggerSourceRoot() {
        projectRule.fixture.addFileToProject("src/requirements.txt", "")

        val srcRoot = projectRule.fixture.file.virtualFile.parent.parent
        PsiTestUtil.addSourceRoot(projectRule.module, srcRoot)

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world.app.lambda_handler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedWithTemplate() {
        projectRule.fixture.addFileToProject("src/requirements.txt", "")

        val srcRoot = projectRule.fixture.file.virtualFile.parent.parent
        PsiTestUtil.addSourceRoot(projectRule.module, srcRoot)

        val templateFile = projectRule.fixture.addFileToProject(
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: hello_world.app.lambda_handler
                  CodeUri: src
                  Runtime: $runtime
                  Timeout: 900
            """.trimIndent()
        )

        val runConfiguration = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = templateFile.virtualFile.path,
            logicalId = "SomeFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime",
        sourceFileName = "app.py",
        runtime = LambdaRuntime.fromValue(runtime)!!,
        mockCredentialsId = mockId,
        input = input,
        expectedOutput = input.uppercase()
    )

    @Test
    fun samIsExecutedWithDebuggerImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime",
        sourceFileName = "app.py",
        runtime = LambdaRuntime.fromValue(runtime)!!,
        mockCredentialsId = mockId,
        input = input,
        expectedOutput = input.uppercase(),
        addBreakpoint = { projectRule.addBreakpoint() }
    )

    @Test
    fun samIsExecutedWithTemplateWithLocalCodeUri() {
        val templateFile = projectRule.fixture.addFileToProject(
            "src/hello_world/template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: app.lambda_handler
                  CodeUri: .
                  Runtime: $runtime
                  Timeout: 900
            """.trimIndent()
        )

        projectRule.fixture.addFileToProject("src/hello_world/requirements.txt", "")
        PsiTestUtil.addSourceRoot(projectRule.module, templateFile.virtualFile.parent)

        val runConfiguration = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = templateFile.virtualFile.path,
            logicalId = "SomeFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun stopDebuggerStopsSamCli() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.run_forever",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
        )
        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()
        stopOnPause(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
    }
}
