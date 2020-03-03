// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.PsiDocumentManager
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import kotlin.test.assertNotNull

class RemoteLambdaRunConfigurationTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val tempDir = TemporaryFolder()

    private val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    @Before
    fun setUp() {
        MockCredentialsManager.getInstance().addCredentials("MockCredentials", mockCreds)
    }

    @After
    fun tearDown() {
        MockCredentialsManager.getInstance().reset()
    }

    @Test
    fun functionNotSet() {
        val runConfiguration = createRunConfiguration(
            project = projectRule.project,
            functionName = null
        )
        assertThat(runConfiguration).isNotNull
        assertThatThrownBy { runConfiguration.checkConfiguration() }
            .isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("lambda.run_configuration.no_function_specified"))
    }

    @Test
    fun invalidRegion() {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                regionId = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("configure.validate.no_region_specified"))
    }

    @Test
    fun noCredentials() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                credentialId = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_credentials_specified"))
        }
    }

    @Test
    fun invalidCredentials() {
        val credentialName = "DNE"
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                credentialId = credentialName
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.credential_not_found_error", credentialName))
        }
    }

    @Test
    fun inputIsSet() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = "{}"
            )
            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun inputTextIsNotSet() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_input_specified"))
        }
    }

    @Test
    fun inputFileDoesNotExist() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = "DoesNotExist",
                inputIsFile = true
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_input_specified"))
        }
    }

    @Test
    fun inputFileDoeExist() {
        val eventFile = projectRule.fixture.addFileToProject("event.json", "TestInputFile")

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = eventFile.virtualFile.path,
                inputIsFile = true
            )
            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun inputTextIsResolved() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = "TestInput"
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInput")
        }
    }

    @Test
    fun inputFileIsResolved() {
        val eventFile = projectRule.fixture.addFileToProject("event.json", "TestInputFile")

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = eventFile.virtualFile.path,
                inputIsFile = true
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("TestInputFile")
        }
    }

    @Test
    fun inputFileIsSaved() {
        val eventFile = projectRule.fixture.addFileToProject("event.json", "TestInputFile")

        runInEdtAndWait {
            WriteAction.run<Throwable> {
                PsiDocumentManager.getInstance(projectRule.project).getDocument(eventFile)!!.setText("UpdatedTestInputFile")
            }

            assertThat(VfsUtilCore.loadText(eventFile.virtualFile)).isEqualTo("TestInputFile")

            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = eventFile.virtualFile.path,
                inputIsFile = true
            )
            assertThat(runConfiguration).isNotNull
            assertThat(getState(runConfiguration).settings.input).isEqualTo("UpdatedTestInputFile")
        }
    }

    @Test // https://github.com/aws/aws-toolkit-jetbrains/issues/1072
    fun creatingACopyDoesNotAliasFields() {
        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(
                project = projectRule.project,
                input = "{}"
            )

            val clonedConfiguration = runConfiguration.clone() as RemoteLambdaRunConfiguration
            clonedConfiguration.name = "Cloned"

            clonedConfiguration.useInputText("Changed input")

            assertThat(clonedConfiguration.inputSource()).isNotEqualTo(runConfiguration.inputSource())
        }
    }

    private fun getState(runConfiguration: RemoteLambdaRunConfiguration): RemoteLambdaState {
        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        assertNotNull(executor)

        val environment = ExecutionEnvironmentBuilder.create(
            DefaultRunExecutor.getRunExecutorInstance(),
            runConfiguration
        ).build()

        return runConfiguration.getState(executor, environment)
    }
}
