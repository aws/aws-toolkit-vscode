// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.RunManager
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.jetbrains.python.run.PythonConfigurationType
import com.jetbrains.python.run.PythonRunConfiguration
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.RegistryRule
import kotlin.test.assertNotNull

class PythonAwsConnectionExtensionIntegrationTest {

    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @Rule
    @JvmField
    val credentialManagerRule = MockCredentialManagerRule()

    @Rule
    @JvmField
    val experiment = RegistryRule(PythonAwsConnectionExtension.FEATURE_ID)

    private val pythonExecutable = System.getenv("PYTHON_PATH")

    @Test
    fun happyPathPythonConnectionInjection() {
        assertThat(pythonExecutable).isNotBlank()
        val file = projectRule.fixture.addFileToProject(
            "hello.py",
            """ 
            import os
            print(os.environ["AWS_REGION"])
            """.trimIndent()
        )

        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", PythonConfigurationType::class.java)
        val runConfiguration = configuration.configuration as PythonRunConfiguration

        runConfiguration.scriptName = file.virtualFile.path
        runConfiguration.sdkHome = pythonExecutable
        val mockRegion = regionProviderRule.createAwsRegion()
        val mockCredential = credentialManagerRule.createCredentialProvider()

        runConfiguration.putCopyableUserData<AwsCredentialInjectionOptions>(
            AWS_CONNECTION_RUN_CONFIGURATION_KEY,
            AwsCredentialInjectionOptions {
                region = mockRegion.id
                credential = mockCredential.id
            }
        )

        VfsRootAccess.allowRootAccess(projectRule.fixture.testRootDisposable, pythonExecutable)

        val executor = ExecutorRegistry.getInstance().getExecutorById(DefaultRunExecutor.EXECUTOR_ID)
        assertNotNull(executor)

        assertThat(executeRunConfigurationAndWait(runConfiguration).stdout).isEqualToIgnoringWhitespace(mockRegion.id)
    }
}
