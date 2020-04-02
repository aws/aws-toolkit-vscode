// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.executors.DefaultDebugExecutor
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
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfiguration
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addBreakpoint
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment

@RunWith(Parameterized::class)
class PythonLocalLambdaRunConfigurationIntegrationTest(private val runtime: Runtime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data(): Collection<Array<Runtime>> = listOf(
            arrayOf(Runtime.PYTHON2_7),
            arrayOf(Runtime.PYTHON3_6),
            arrayOf(Runtime.PYTHON3_7),
            arrayOf(Runtime.PYTHON3_8)
        )
    }

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        val fixture = projectRule.fixture
        fixture.addFileToProject(
            "src/hello_world/__init__.py",
            ""
        )

        val psiClass = fixture.addFileToProject(
            "src/hello_world/app.py",
            """
            import os

            def lambda_handler(event, context):
                print(os.environ)
                return "Hello world"

            def env_print(event, context):
                return dict(**os.environ)
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @After
    fun tearDown() {
        MockCredentialsManager.getInstance().reset()
    }

    @Test
    fun samIsExecuted() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.lambda_handler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")
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

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")
    }

    @Test
    fun envVarsArePassed() {
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

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
    }

    @Test
    fun regionIsPassed() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.env_print",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_REGION", MockRegionProvider.getInstance().defaultRegion().id)
    }

    @Test
    fun credentialsArePassed() {
        projectRule.fixture.addFileToProject("requirements.txt", "")

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "src/hello_world.app.env_print",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfiguration(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
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

        val executeLambda = executeRunConfiguration(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
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

        val executeLambda = executeRunConfiguration(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
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

        val executeLambda = executeRunConfiguration(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

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

        val executeLambda = executeRunConfiguration(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    private fun jsonToMap(data: String) = jacksonObjectMapper().readValue<Map<String, String>>(data)
}
