// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.goide.execution.GoBuildingRunConfiguration
import com.goide.execution.application.GoApplicationConfiguration
import com.goide.execution.application.GoApplicationRunConfigurationType
import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.RunManager
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.WebModuleTypeBase
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.common.ThreadLeakTracker
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.ExperimentRule
import software.aws.toolkits.jetbrains.utils.rules.HeavyGoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.ensureCorrectGoVersion
import kotlin.test.assertNotNull

class GoAwsConnectionRunConfigurationExtensionIntegrationTest {

    @Rule
    @JvmField
    val projectRule = HeavyGoCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @Rule
    @JvmField
    val credentialManagerRule = MockCredentialManagerRule()

    @Rule
    @JvmField
    val experiment = ExperimentRule(GoAwsConnectionExperiment)

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Before
    fun setup() {
        ThreadLeakTracker.longRunningThreadCreated(ApplicationManager.getApplication(), "TerminalEmulator-TtyConnector")
        projectRule.fixture.ensureCorrectGoVersion(disposableRule.disposable)
        PsiTestUtil.addModule(projectRule.project, WebModuleTypeBase.getInstance(), "main", projectRule.fixture.tempDirFixture.findOrCreateDir("."))
    }

    @Test
    fun environmentVariablesInjectedIntoGoRuntimes() {
        // language=go
        val fileContents = """
            package main
            
            import (
                "fmt"
                "os"
            )
            
            func main() {
                fmt.Println(os.Getenv("AWS_REGION"))
            }
        """.trimIndent()

        val psiFile = projectRule.fixture.addFileToProject("main.go", fileContents)

        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", GoApplicationRunConfigurationType::class.java)
        val runConfiguration = configuration.configuration as GoApplicationConfiguration

        runConfiguration.kind = GoBuildingRunConfiguration.Kind.FILE
        runConfiguration.isRunAfterBuild = true
        runConfiguration.filePaths = listOf(psiFile.virtualFile.canonicalPath)

        val mockRegion = regionProviderRule.createAwsRegion()
        val mockCredential = credentialManagerRule.createCredentialProvider()
        runConfiguration.putCopyableUserData(
            AWS_CONNECTION_RUN_CONFIGURATION_KEY,
            AwsCredentialInjectionOptions {
                region = mockRegion.id
                credential = mockCredential.id
            }
        )

        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        assertNotNull(executor)

        assertThat(executeRunConfigurationAndWait(runConfiguration).stdout).isEqualToIgnoringWhitespace(mockRegion.id)
    }
}
