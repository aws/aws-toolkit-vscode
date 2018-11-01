// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiFile
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.zipEntries
import software.aws.toolkits.jetbrains.utils.rules.PyVirtualEnvSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import java.util.concurrent.TimeUnit

class PythonLambdaPackagerTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val packager = PythonLambdaPackager()

    private lateinit var psiFile: PsiFile

    @Before
    fun setUp() {
        psiFile = projectRule.fixture.addFileToProject(
            "hello_world/app.py",
            """
            def handle(event, context):
                return "HelloWorld"
            """.trimIndent()
        )
    }

    @Test
    fun testContentRootIsAdded() {
        runAndVerifyExpectedEntries(projectRule.module, psiFile, "hello_world/app.py")
    }

    @Test
    fun testVirtualEnvIsNotAdded() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyVirtualEnvSdk(module))

        runAndVerifyExpectedEntries(projectRule.module, psiFile, "hello_world/app.py")
    }

    @Test
    fun testSitePackagesAreAdded() {
        val module = projectRule.module
        val pyVirtualEnvSdk = PyVirtualEnvSdk(module)
        pyVirtualEnvSdk.addSitePackage("someLib")
        ModuleRootModificationUtil.setModuleSdk(module, pyVirtualEnvSdk)

        runAndVerifyExpectedEntries(
            projectRule.module, psiFile,
            "hello_world/app.py",
            "someLib/__init__.py"
        )
    }

    private fun runAndVerifyExpectedEntries(module: Module, handlerFile: PsiFile, vararg entries: String) {
        LocalFileSystem.getInstance().refresh(false)

        val completableFuture = runInEdtAndGet {
            packager.createPackage(module, handlerFile)
        }

        val lambdaPackager = completableFuture.toCompletableFuture().get(30, TimeUnit.SECONDS)

        assertThat(zipEntries(lambdaPackager.location)).containsExactlyInAnyOrder(*entries)
    }
}