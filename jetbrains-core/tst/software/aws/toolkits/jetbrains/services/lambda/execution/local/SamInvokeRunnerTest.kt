// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.services.lambda.model.Runtime

class SamInvokeRunnerTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val tempDir = TemporaryFolder()

    @Test
    fun canRunSupportedRuntimeHandler() {
        val runConfig =
            createHandlerBasedRunConfiguration(project = projectRule.project, runtime = Runtime.JAVA8)

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultRunExecutor.EXECUTOR_ID, runConfig)).isTrue()
        }
    }

    @Test
    fun canRunUnsupportedRuntimeHandler() {
        val runConfig =
            createHandlerBasedRunConfiguration(project = projectRule.project, runtime = Runtime.UNKNOWN_TO_SDK_VERSION)

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultRunExecutor.EXECUTOR_ID, runConfig)).isTrue()
        }
    }

    @Test
    fun canDebugSupportedRuntimeHandler() {
        val runConfig =
            createHandlerBasedRunConfiguration(project = projectRule.project, runtime = Runtime.JAVA8)

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultDebugExecutor.EXECUTOR_ID, runConfig)).isTrue()
        }
    }

    @Test
    fun cannotDebugUnsupportedRuntimeHandler() {
        val runConfig =
            createHandlerBasedRunConfiguration(project = projectRule.project, runtime = Runtime.UNKNOWN_TO_SDK_VERSION)

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultDebugExecutor.EXECUTOR_ID, runConfig)).isFalse()
        }
    }

    @Test
    fun canRunSupportedRuntimeTemplate() {
        val template = addTemplate(
            """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      CodeUri: /some/dummy/code/location
                      Runtime: java8
                """.trimIndent()
        )

        val runConfig = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = template,
            logicalId = "SomeFunction"
        )

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultRunExecutor.EXECUTOR_ID, runConfig)).isTrue()
        }
    }

    @Test
    fun canRunUnsupportedRuntimeTemplate() {
        val template = addTemplate(
            """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      CodeUri: /some/dummy/code/location
                      Runtime: FAKE
                """.trimIndent()
        )

        val runConfig = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = template,
            logicalId = "SomeFunction"
        )

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultRunExecutor.EXECUTOR_ID, runConfig)).isTrue()
        }
    }

    @Test
    fun canDebugSupportedRuntimeTemplate() {
        val template = addTemplate(
            """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      CodeUri: /some/dummy/code/location
                      Runtime: java8
                """.trimIndent()
        )

        val runConfig = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = template,
            logicalId = "SomeFunction"
        )

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultDebugExecutor.EXECUTOR_ID, runConfig)).isTrue()
        }
    }

    @Test
    fun cannotDebugUnsupportedRuntimeTemplate() {
        val template = addTemplate(
            """
                Resources:
                  SomeFunction:
                    Type: AWS::Serverless::Function
                    Properties:
                      Handler: com.example.LambdaHandler::handleRequest
                      CodeUri: /some/dummy/code/location
                      Runtime: FAKE
                """.trimIndent()
        )

        val runConfig = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = template,
            logicalId = "SomeFunction"
        )

        runInEdtAndWait {
            assertThat(SamInvokeRunner().canRun(DefaultDebugExecutor.EXECUTOR_ID, runConfig)).isFalse()
        }
    }

    private fun addTemplate(template: String): String = tempDir.newFile("template.yaml").also {
        it.writeText(template)
    }.absolutePath
}
