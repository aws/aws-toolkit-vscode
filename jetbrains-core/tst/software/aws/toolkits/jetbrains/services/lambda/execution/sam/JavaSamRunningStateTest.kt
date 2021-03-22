// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createHandlerBasedRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.local.createTemplateRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils.addSamTemplate
import software.aws.toolkits.jetbrains.utils.getState
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.setUpGradleProject

class JavaSamRunningStateTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    private val mockCredsId = "mockId"

    @Before
    fun setUp() {
        // force fixture to be created before write action in EDT
        projectRule.fixture
        credentialManager.addCredentials(mockCredsId)

        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(projectRule.project).projectSdk = sdk
            }
        }
    }

    @Test
    fun addsJavaHomeEnvVarForJavaTemplate() {
        val logicalId = "SomeFunction"

        val template = projectRule.fixture.addSamTemplate(
            logicalName = logicalId,
            codeUri = "/some/dummy/code/location",
            runtime = LambdaRuntime.JAVA8,
            handler = "com.example.LambdaHandler::handleRequest"
        )

        val runConfig = createTemplateRunConfiguration(
            project = projectRule.project,
            templateFile = template.virtualFile.path,
            logicalId = logicalId,
            credentialsProviderId = mockCredsId
        )

        val settings = runInEdtAndGet {
            getRunConfigState(runConfig).settings
        }

        val request = SamRunningState.buildBuildLambdaRequest(projectRule.project, settings)
        assertThat(request.buildEnvVars).extractingByKey("JAVA_HOME").isEqualTo(IdeaTestUtil.getMockJdk18Path().absolutePath)
    }

    @Test
    fun addsJavaHomeEnvVarForJavaHandler() {
        val module = this.projectRule.fixture.addModule("main")
        this.projectRule.fixture.addClass(
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
        this.projectRule.setUpGradleProject()

        val runConfig = createHandlerBasedRunConfiguration(
            project = projectRule.project,
            runtime = LambdaRuntime.JAVA8.toSdkRuntime(),
            input = "\"Hello World\"",
            credentialsProviderId = mockCredsId
        )

        val settings = runInEdtAndGet {
            getRunConfigState(runConfig).settings
        }

        val request = SamRunningState.buildBuildLambdaRequest(projectRule.project, settings)
        assertThat(request.buildEnvVars).extractingByKey("JAVA_HOME").isEqualTo(IdeaTestUtil.getMockJdk18Path().absolutePath)
    }

    private fun getRunConfigState(runConfiguration: LocalLambdaRunConfiguration) = getState(runConfiguration) as SamRunningState
}
