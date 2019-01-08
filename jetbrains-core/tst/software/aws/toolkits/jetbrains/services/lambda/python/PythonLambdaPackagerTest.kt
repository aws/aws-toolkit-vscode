// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiFile
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.zipEntries
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.utils.rules.PyVirtualEnvSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import java.util.concurrent.TimeUnit

class PythonLambdaPackagerTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val packager = PythonLambdaPackager()

    @Test
    fun testContentRootIsAdded() {
        val psiFile = addPythonHandler("hello_world/app.py")
        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py"
        )
    }

    @Test
    fun testContentRootSubFolderIsAdded() {
        val psiFile = addPythonHandler("src/hello_world/app.py")
        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "src/hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/src/hello_world/app.py" to "src/hello_world/app.py"
        )
    }

    @Test
    fun testSourceRootTakesPrecedence() {
        val psiFile = addPythonHandler("src/hello_world/app.py")
        PsiTestUtil.addSourceRoot(projectRule.module, psiFile.virtualFile.parent.parent)

        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/src/hello_world/app.py" to "hello_world/app.py"
        )
    }

    @Test
    fun testVirtualEnvIsNotAdded() {
        val module = projectRule.module
        ModuleRootModificationUtil.setModuleSdk(module, PyVirtualEnvSdk(module))
        val psiFile = addPythonHandler("hello_world/app.py")

        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py"
        )
    }

    @Test
    fun testRootsAreNotAdded() {
        val testPsiFile = projectRule.fixture.addFileToProject(
            "test/hello/test.py", """
            def blah():
                pass
        """.trimIndent()
        )
        PsiTestUtil.addSourceRoot(projectRule.module, testPsiFile.virtualFile.parent.parent, true)
        val psiFile = addPythonHandler("hello_world/app.py")

        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py"
        )
    }

    @Test
    fun testSitePackagesAreAdded() {
        val module = projectRule.module
        val pyVirtualEnvSdk = PyVirtualEnvSdk(module)
        pyVirtualEnvSdk.addSitePackage("someLib")
        ModuleRootModificationUtil.setModuleSdk(module, pyVirtualEnvSdk)
        val psiFile = addPythonHandler("hello_world/app.py")

        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py", "someLib/__init__.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py",
            "%PROJECT_ROOT%/venv/lib/site-packages/someLib/__init__.py" to "someLib/__init__.py"
        )
    }

    @Test
    fun testDSStoreIsIgnored() {
        val psiFile = addPythonHandler("hello_world/app.py")
        runInEdtAndWait {
            runWriteAction {
                psiFile.containingDirectory.virtualFile.createChildData(null, ".DS_Store")
            }
        }
        val lambdaPackage = runPackager(projectRule.module, psiFile)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py"
        )
    }

    private fun addPythonHandler(path: String): PsiFile = projectRule.fixture.addFileToProject(
        path,
        """
            def handle(event, context):
                return "HelloWorld"
            """.trimIndent()
    )

    private fun runPackager(module: Module, handlerFile: PsiFile): LambdaPackage {
        LocalFileSystem.getInstance().refresh(false)

        val completableFuture = runInEdtAndGet {
            packager.createPackage(module, handlerFile)
        }

        return completableFuture.toCompletableFuture().get(30, TimeUnit.SECONDS)
    }

    private fun verifyExpectedEntries(lambdaPackage: LambdaPackage, vararg entries: String) {
        assertThat(zipEntries(lambdaPackage.location)).containsExactlyInAnyOrder(*entries)
    }

    private fun verifyPathMappings(lambdaPackage: LambdaPackage, vararg mappings: Pair<String, String>) {
        val basePath = ModuleRootManager.getInstance(projectRule.module).contentRoots[0].path
        val updatedPaths = mappings.asSequence()
            .map { (path, file) -> path.replace("%PROJECT_ROOT%", basePath) to file }
            .toMap()
        println(lambdaPackage.mappings)
        assertThat(lambdaPackage.mappings).containsAllEntriesOf(updatedPaths)
    }
}