// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.module.ModuleType
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.FrameworkTestUtils
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.HeavyNodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import software.aws.toolkits.jetbrains.utils.samImageRunDebugTest
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment

@RunWith(Parameterized::class)
class NodeJsLocalLambdaRunConfigurationIntegrationTest(private val runtime: Runtime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun parameters(): Collection<Array<Runtime>> = SUPPORTED_NODE_RUNTIMES
    }

    @Rule
    @JvmField
    val projectRule = HeavyNodeJsCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val credentialsManager = MockCredentialManagerRule()

    private val input = RuleUtils.randomName()

    private val fileContents =
        // language=JS
        """
        function abc() {
            return 'Hello World'
        }
        
        exports.lambdaHandler = async (event, context) => {
            return abc()
        };
        """.trimIndent()

    private lateinit var mockCredentialsId: String

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        val fixture = projectRule.fixture
        PsiTestUtil.addModule(projectRule.project, ModuleType.EMPTY, "main", fixture.tempDirFixture.findOrCreateDir("."))

        val psiFile = fixture.addFileToProject("hello_world/app.js", fileContents)

        runInEdtAndWait {
            fixture.openFileInEditor(psiFile.virtualFile)
        }

        mockCredentialsId = credentialsManager.createCredentialProvider().id
        FrameworkTestUtils.ensureBuiltInServerStarted()
    }

    @Test
    fun samIsExecuted() {
        projectRule.fixture.addPackageJsonFile()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockCredentialsId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")
    }

    @Test
    fun samIsExecutedWithFileInput() {
        projectRule.fixture.addPackageJsonFile()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = projectRule.fixture.tempDirFixture.createFile("tmp", "\"Hello World\"").canonicalPath!!,
            inputIsFile = true,
            credentialsProviderId = mockCredentialsId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")
    }

    @Test
    fun samIsExecutedWithContainer() {
        projectRule.fixture.addPackageJsonFile()

        val samOptions = SamOptions().apply {
            this.buildInContainer = true
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockCredentialsId,
            samOptions = samOptions
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")
    }

    @Test
    fun samIsExecutedWhenRunWithATemplateServerless() {
        projectRule.fixture.addPackageJsonFile(subPath = "hello_world")

        val templateFile = projectRule.fixture.addFileToModule(
            projectRule.module,
            "template.yaml",
            // language=yaml
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: app.lambdaHandler
                  CodeUri: hello_world
                  Runtime: $runtime
                  Timeout: 900
            """.trimIndent()
        )

        val runConfiguration = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = templateFile.containingFile.virtualFile.path,
            logicalId = "SomeFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockCredentialsId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")
    }

    @Test
    fun samIsExecutedWithDebugger() {
        projectRule.fixture.addPackageJsonFile()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockCredentialsId
        )

        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()

        val debuggerIsHit = checkBreakPointHit(projectRule.project)
        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedWithDebuggersameFileNames() {
        projectRule.fixture.addPackageJsonFile()

        val psiFile = projectRule.fixture.addFileToProject("hello_world/subfolder/app.js", fileContents)

        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(psiFile.virtualFile)
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/subfolder/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockCredentialsId
        )

        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()

        val debuggerIsHit = checkBreakPointHit(projectRule.project)
        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime",
        sourceFileName = "app.js",
        runtime = LambdaRuntime.fromValue(runtime)!!,
        mockCredentialsId = mockCredentialsId,
        input = input,
        expectedOutput = input.uppercase()
    )

    @Test
    fun samIsExecutedWithDebuggerImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime",
        sourceFileName = "app.js",
        runtime = LambdaRuntime.fromValue(runtime)!!,
        mockCredentialsId = mockCredentialsId,
        input = input,
        expectedOutput = input.uppercase(),
        addBreakpoint = { projectRule.addBreakpoint() }
    )
}
