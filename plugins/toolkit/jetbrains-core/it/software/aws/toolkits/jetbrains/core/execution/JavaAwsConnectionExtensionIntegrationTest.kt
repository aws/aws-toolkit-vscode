// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.compiler.CompilerTestUtil
import com.intellij.execution.RunManager
import com.intellij.execution.application.ApplicationConfiguration
import com.intellij.execution.application.ApplicationConfigurationType
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.projectRoots.impl.SdkConfigurationUtil
import com.intellij.openapi.roots.CompilerProjectExtension
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.compileProjectAndWait
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.utils.executeRunConfigurationAndWait
import software.aws.toolkits.jetbrains.utils.rules.ExperimentRule
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule

class JavaAwsConnectionExtensionIntegrationTest {

    @Before
    fun setUp() {
        CompilerTestUtil.enableExternalCompiler()
    }

    @After
    fun tearDown() {
        CompilerTestUtil.disableExternalCompiler(projectRule.project)
    }

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val regionProviderRule = MockRegionProviderRule()

    @Rule
    @JvmField
    val credentialManagerRule = MockCredentialManagerRule()

    @Rule
    @JvmField
    val experiment = ExperimentRule(JavaAwsConnectionExperiment)

    @Test
    fun connectionDetailsAreInjected() {
        val fixture = projectRule.fixture

        val module = fixture.addModule("main")

        val psiClass = fixture.addClass(
            module,
            """
            package com.example;

            public class AnyOldClass {
                public static void main(String[] args) {
                    System.out.println(System.getenv("AWS_REGION"));
                }
            }
            """
        )

        val mockRegion = regionProviderRule.createAwsRegion()
        val mockCredential = credentialManagerRule.createCredentialProvider()
        val runManager = RunManager.getInstance(projectRule.project)
        val configuration = runManager.createConfiguration("test", ApplicationConfigurationType::class.java)
        val runConfiguration = configuration.configuration as ApplicationConfiguration
        runConfiguration.putCopyableUserData(
            AWS_CONNECTION_RUN_CONFIGURATION_KEY,
            AwsCredentialInjectionOptions {
                region = mockRegion.id
                credential = mockCredential.id
            }
        )

        runReadAction {
            runConfiguration.setMainClass(psiClass)
        }

        compileModule(module)

        assertThat(executeRunConfigurationAndWait(runConfiguration).stdout).isEqualToIgnoringWhitespace(mockRegion.id)
    }

    private fun compileModule(module: Module) {
        setUpCompiler()
        compileProjectAndWait(module.project)
    }

    private fun setUpCompiler() {
        val project = projectRule.project
        val modules = ModuleManager.getInstance(project).modules

        WriteCommandAction.writeCommandAction(project).run<Nothing> {
            val compilerExtension = CompilerProjectExtension.getInstance(project)!!
            compilerExtension.compilerOutputUrl = projectRule.fixture.tempDirFixture.findOrCreateDir("out").url
            val jdkHome = IdeaTestUtil.requireRealJdkHome()
            VfsRootAccess.allowRootAccess(projectRule.fixture.testRootDisposable, jdkHome)
            val jdkHomeDir = LocalFileSystem.getInstance().refreshAndFindFileByPath(jdkHome)!!
            val jdkName = "Real JDK"
            val jdk = SdkConfigurationUtil.setupSdk(emptyArray(), jdkHomeDir, JavaSdk.getInstance(), false, null, jdkName)!!

            ProjectJdkTable.getInstance().addJdk(jdk, projectRule.fixture.testRootDisposable)

            for (module in modules) {
                ModuleRootModificationUtil.setModuleSdk(module, jdk)
            }
        }

        runInEdtAndWait {
            PlatformTestUtil.saveProject(project)
            CompilerTestUtil.saveApplicationSettings()
        }
    }
}
