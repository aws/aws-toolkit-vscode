// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.compiler.CompilerTestUtil
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.utils.addBreakpoint
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.samImageRunDebugTest
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import software.aws.toolkits.jetbrains.utils.setUpGradleProject
import software.aws.toolkits.jetbrains.utils.setUpJdk

@RunWith(Parameterized::class)
class JavaLocalLambdaRunConfigurationIntegrationTest(private val runtime: LambdaRuntime) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data() = listOf(
            arrayOf(LambdaRuntime.JAVA8),
            arrayOf(LambdaRuntime.JAVA8_AL2),
            arrayOf(LambdaRuntime.JAVA11),
            arrayOf(LambdaRuntime.JAVA17)
        )
    }

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    private val mockId = "MockCredsId"
    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")
    private val input = RuleUtils.randomName()

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        val fixture = projectRule.fixture
        val module = fixture.addModule("main")
        val psiClass = fixture.addClass(
            module,
            """
            package com.example;

            public class LambdaHandler {
                public String handleRequest(String request) {
                    return request.toUpperCase();
                }
            }
            """
        )

        val compatibility = when (runtime) {
            LambdaRuntime.JAVA8, LambdaRuntime.JAVA8_AL2 -> "1.8"
            LambdaRuntime.JAVA11 -> "11"
            LambdaRuntime.JAVA17 -> "17"
            else -> throw NotImplementedError()
        }

        projectRule.setUpJdk()

        projectRule.setUpGradleProject(compatibility)

        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @After
    fun tearDown() {
        CompilerTestUtil.disableExternalCompiler(projectRule.project)
        MockCredentialsManager.getInstance().reset()
    }

    @Test
    fun samIsExecuted() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("HELLO WORLD")
    }

    @Test
    fun samIsExecutedWithFileInput() {
        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            input = projectRule.fixture.tempDirFixture.createFile("tmp", "\"Hello World\"").canonicalPath!!,
            inputIsFile = true,
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("HELLO WORLD")
    }

    @Test
    fun samIsExecutedWhenRunWithATemplateServerless() {
        val templateFile = projectRule.fixture.addFileToModule(
            projectRule.module,
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: com.example.LambdaHandler::handleRequest
                  CodeUri: .
                  Runtime: $runtime
                  Timeout: 900
            """.trimIndent()
        )

        val runConfiguration = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = templateFile.containingFile.virtualFile.path,
            logicalId = "SomeFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("HELLO WORLD")
    }

    @Test
    fun samIsExecutedWhenRunWithATemplateLambda() {
        val templateFile = projectRule.fixture.addFileToModule(
            projectRule.module,
            "template.yaml",
            """
            Resources:
              SomeFunction:
                Type: AWS::Lambda::Function
                Properties:
                  Handler: com.example.LambdaHandler::handleRequest
                  Code: .
                  Runtime: $runtime
                  Timeout: 900
            """.trimIndent()
        )

        val runConfiguration = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = templateFile.containingFile.virtualFile.path,
            logicalId = "SomeFunction",
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )

        assertThat(runConfiguration).isNotNull

        val executeLambda = executeRunConfigurationAndWait(runConfiguration)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("HELLO WORLD")
    }

    @Test
    fun samIsExecutedWithDebugger() {
        projectRule.addBreakpoint()

        val runConfiguration = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = runtime.toSdkRuntime(),
            input = "\"Hello World\"",
            credentialsProviderId = mockId
        )
        assertThat(runConfiguration).isNotNull

        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        val executeLambda = executeRunConfigurationAndWait(runConfiguration, DefaultDebugExecutor.EXECUTOR_ID)

        assertThat(executeLambda.exitCode).isEqualTo(0)
        assertThat(executeLambda.stdout).contains("HELLO WORLD")

        assertThat(debuggerIsHit.get()).isTrue()
    }

    @Test
    fun samIsExecutedWhenRunWithATemplateImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime/maven",
        sourceFileName = "App.java",
        runtime = runtime,
        mockCredentialsId = mockId,
        input = input,
        expectedOutput = input.uppercase()
    )

    @Test
    fun samIsExecutedWithDebuggerImage(): Unit = samImageRunDebugTest(
        projectRule = projectRule,
        relativePath = "samProjects/image/$runtime/maven",
        sourceFileName = "App.java",
        runtime = runtime,
        mockCredentialsId = mockId,
        input = input,
        expectedOutput = input.uppercase(),
        addBreakpoint = { projectRule.addBreakpoint() }
    )
}
