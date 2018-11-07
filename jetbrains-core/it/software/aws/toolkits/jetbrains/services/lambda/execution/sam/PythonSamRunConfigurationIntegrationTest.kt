// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.xdebugger.XDebuggerUtil
import com.jetbrains.python.psi.PyFile
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

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

    @Before
    fun setUp() {
        SamSettings.getInstance().savedExecutablePath = System.getenv().getOrDefault("SAM_CLI_EXEC", "sam")

        val fixture = projectRule.fixture
        fixture.addFileToProject(
            "hello_world/__init__.py",
            ""
        )

        val psiClass = fixture.addFileToProject(
            "hello_world/app.py",
            """
            def lambda_handler(event, context):
                return "Hello world"
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }
    }

    @Test
    fun samIsExecuted() {
        val runConfiguration = runConfiguration()
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeLambda(runConfiguration)
        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello world")
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

        val runConfiguration = runConfiguration()
        assertThat(runConfiguration).isNotNull

        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeLambda(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        // assertThat(executeLambda.exitCode).isEqualTo(0) TODO: When debugging, always exits with 137
        assertThat(executeLambda.stdout).contains("Hello world")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    private fun runConfiguration(): SamRunConfiguration = createRunConfiguration(
        project = projectRule.project,
        input = "\"Hello World\"",
        handler = "hello_world.app.lambda_handler",
        runtime = runtime
    )
}