// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.lang.typescript.compiler.languageService.TypeScriptLanguageServiceUtil
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.module.ModuleType
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.AfterClass
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.BeforeClass
import org.junit.ClassRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.utils.FrameworkTestUtils.ensureBuiltInServerStarted
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.HeavyNodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addTypeScriptPackageJsonFile
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.nio.file.Paths

@RunWith(Parameterized::class)
class NodeJsLocalTypeScriptLambdaRunConfigurationIntegrationTest(private val runtime: Runtime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun parameters(): Collection<Array<Runtime>> = SUPPORTED_NODE_RUNTIMES

        private var tsUseServiceSetting = false

        @ClassRule
        @JvmField
        public val applicationRule = ApplicationRule()

        @JvmStatic
        @BeforeClass
        fun beforeAll() {
            assumeTrue("Needs evaulation on what issues are with >= 232", ApplicationInfo.getInstance().build.baselineVersion < 232)

            // TS service is disabled in unit tests by default
            TypeScriptLanguageServiceUtil.setUseService(true)
        }

        @JvmStatic
        @AfterClass
        fun afterAll() {
            TypeScriptLanguageServiceUtil.setUseService(tsUseServiceSetting)
        }
    }

    @Rule
    @JvmField
    val projectRule = HeavyNodeJsCodeInsightTestFixtureRule()

    private val input = RuleUtils.randomName()
    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    private val fileContents =
        // language=TS
        """
        function abc() {
            return 'Hello World'
        }
        
        export const lambdaHandler = async (event, context) => {
            return abc()
        };
        """.trimIndent()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        val fixture = projectRule.fixture
        // project basepath needs to exist or TS compiler won't work
        Paths.get(fixture.project.basePath).toFile().mkdir()
        PsiTestUtil.addModule(projectRule.project, ModuleType.EMPTY, "main", fixture.tempDirFixture.findOrCreateDir("."))

        val psiFile = fixture.addFileToProject("hello_world/app.ts", fileContents)

        runInEdtAndWait {
            fixture.openFileInEditor(psiFile.virtualFile)
        }

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
        ensureBuiltInServerStarted()
    }

    @After
    fun tearDown() {
        MockCredentialsManager.getInstance().reset()
    }

    @Test
    fun samIsExecuted() {
        projectRule.fixture.addTypeScriptPackageJsonFile()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")
    }

    @Test
    fun samIsExecutedWithContainer() {
        projectRule.fixture.addTypeScriptPackageJsonFile()

        val samOptions = SamOptions().apply {
            this.buildInContainer = true
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId,
            samOptions = samOptions
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")
    }

    @Test
    fun samIsExecutedWithDebugger() {
        projectRule.fixture.addTypeScriptPackageJsonFile()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
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
        projectRule.fixture.addTypeScriptPackageJsonFile()

        val psiFile = projectRule.fixture.addFileToProject("hello_world/subfolder/app.ts", fileContents)

        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(psiFile.virtualFile)
        }

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime,
            handler = "hello_world/subfolder/app.lambdaHandler",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        projectRule.addBreakpoint()

        val debuggerIsHit = checkBreakPointHit(projectRule.project)
        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("Hello World")

        assertThat(debuggerIsHit.get()).isTrue()
    }
}
