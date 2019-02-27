// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.xdebugger.XDebuggerUtil
import com.jetbrains.python.psi.PyFile
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

@Ignore
@RunWith(Parameterized::class)
class PythonSamRunConfigurationIntegrationTest(private val runtime: Runtime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data(): Collection<Array<Runtime>> = listOf(
            arrayOf(Runtime.PYTHON2_7),
            arrayOf(Runtime.PYTHON3_6)
        )
    }

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        SamSettings.getInstance().savedExecutablePath = System.getenv().getOrDefault("SAM_CLI_EXEC", "sam")

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
        val runConfiguration = runConfiguration("src/hello_world.app.lambda_handler")
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeLambda(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")
    }

    @Test
    fun envVarsArePassed() {
        val envVars = mutableMapOf("Foo" to "Bar", "Bat" to "Baz")

        val runConfiguration = runConfiguration(
            handler = "src/hello_world.app.env_print",
            environmentVariables = envVars
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeLambda(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("Foo", "Bar")
            .containsEntry("Bat", "Baz")
    }

    @Test
    fun regionIsPassed() {
        val runConfiguration = runConfiguration("src/hello_world.app.env_print")
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeLambda(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_REGION", "us-west-2")
    }

    @Test
    fun credentialsArePassed() {
        val runConfiguration = runConfiguration("src/hello_world.app.env_print")
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeLambda(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(jsonToMap(executeLambda.stdout))
            .containsEntry("AWS_ACCESS_KEY_ID", mockCreds.accessKeyId())
            .containsEntry("AWS_SECRET_ACCESS_KEY", mockCreds.secretAccessKey())
    }

    @Test
    fun samIsExecutedWithDebugger() {
        runInEdtAndWait {
            val document = projectRule.fixture.editor.document
            val lambdaClass = projectRule.fixture.file as PyFile
            val lambdaBody = lambdaClass.topLevelFunctions[0].statementList.statements[0]
            val lineNumber = document.getLineNumber(lambdaBody.textOffset)

            XDebuggerUtil.getInstance().toggleLineBreakpoint(
                projectRule.project,
                projectRule.fixture.file.virtualFile,
                lineNumber
            )
        }

        val runConfiguration = runConfiguration("src/hello_world.app.lambda_handler")
        assertThat(runConfiguration).isNotNull

        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeLambda(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedWithDebuggerSourceRoot() {
        runInEdtAndWait {
            val document = projectRule.fixture.editor.document
            val lambdaClass = projectRule.fixture.file as PyFile
            val lambdaBody = lambdaClass.topLevelFunctions[0].statementList.statements[0]
            val lineNumber = document.getLineNumber(lambdaBody.textOffset)

            XDebuggerUtil.getInstance().toggleLineBreakpoint(
                projectRule.project,
                projectRule.fixture.file.virtualFile,
                lineNumber
            )
        }

        val srcRoot = projectRule.fixture.file.virtualFile.parent.parent
        PsiTestUtil.addSourceRoot(projectRule.module, srcRoot)

        val runConfiguration = runConfiguration("hello_world.app.lambda_handler")
        assertThat(runConfiguration).isNotNull

        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeLambda(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    private fun runConfiguration(
        handler: String,
        environmentVariables: MutableMap<String, String> = mutableMapOf()
    ): SamRunConfiguration =
        createHandlerBasedRunConfiguration(
            project = projectRule.project,
            input = "\"Hello World\"",
            handler = handler,
            runtime = runtime,
            credentialsProviderId = mockId,
            region = AwsRegion("us-west-2", "us-west-2"),
            environmentVariables = environmentVariables
        )

    private fun jsonToMap(data: String) = jacksonObjectMapper().readValue<Map<String, String>>(data)
}