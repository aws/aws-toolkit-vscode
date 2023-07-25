// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.ExecutorRegistry
import com.intellij.execution.RunManager
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.runWriteActionAndWait
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.use
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.DisposableRule
import com.intellij.util.SystemProperties
import com.jetbrains.python.run.PythonConfigurationType
import com.jetbrains.python.run.PythonRunConfiguration
import com.jetbrains.python.sdk.PyDetectedSdk
import com.jetbrains.python.sdk.detectSystemWideSdks
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.ExperimentRule
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import java.nio.file.FileSystems
import java.nio.file.Files
import java.nio.file.Paths
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
    val experiment = ExperimentRule(PythonAwsConnectionExperiment)

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Test
    fun happyPathPythonConnectionInjection() {
        assumeTrue("Needs heavy project on >= 232", ApplicationInfo.getInstance().build.baselineVersion < 232)
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

        lateinit var pythonExecutable: String
        Disposer.newDisposable().use { disposable ->
            // Allow us to search system for all pythons
            FileSystems.getDefault().rootDirectories.forEach { root ->
                Files.list(root).forEach {
                    VfsRootAccess.allowRootAccess(disposable, it.toString())
                }
            }

            pythonExecutable = detectSystemWideSdks(null, emptyList()).firstOrNull()?.homePath
                // hack for CI because we use pyenv and 221 changed detection logic
                ?: Paths.get(SystemProperties.getUserHome())
                    .resolve(".pyenv")
                    .resolve("versions")
                    .toFile().listFiles()!!.first()
                    .resolve("bin")
                    .resolve("python")
                    .path
        }

        assertThat(pythonExecutable).isNotEmpty
        runWriteActionAndWait {
            ProjectJdkTable.getInstance().addJdk(PyDetectedSdk(pythonExecutable), disposableRule.disposable)
        }
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
