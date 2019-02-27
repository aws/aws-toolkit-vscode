// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiElement
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.utils.rules.PyVirtualEnvSdk
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlin.streams.toList

class PythonLambdaPackagerTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    private val packager = PythonLambdaPackager()

    @Test
    fun testContentRootIsAdded() {
        val handler = addPythonHandler("hello_world/app.py")
        val lambdaPackage = runPackager(projectRule.module, handler)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py"
        )
    }

    @Test
    fun testContentRootSubFolderIsAdded() {
        val handler = addPythonHandler("src/hello_world/app.py")
        val lambdaPackage = runPackager(projectRule.module, handler)
        verifyExpectedEntries(lambdaPackage, "src/hello_world/app.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/src/hello_world/app.py" to "src/hello_world/app.py"
        )
    }

    @Test
    fun testSourceRootTakesPrecedence() {
        val handler = addPythonHandler("src/hello_world/app.py")
        PsiTestUtil.addSourceRoot(projectRule.module, handler.containingFile.virtualFile.parent.parent)

        val lambdaPackage = runPackager(projectRule.module, handler)
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
        val handler = addPythonHandler("hello_world/app.py")

        val lambdaPackage = runPackager(projectRule.module, handler)
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
        val handler = addPythonHandler("hello_world/app.py")

        val lambdaPackage = runPackager(projectRule.module, handler)
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
        val handler = addPythonHandler("hello_world/app.py")

        val lambdaPackage = runPackager(projectRule.module, handler)
        verifyExpectedEntries(lambdaPackage, "hello_world/app.py", "someLib/__init__.py")
        verifyPathMappings(
            lambdaPackage,
            "%PROJECT_ROOT%/hello_world/app.py" to "hello_world/app.py",
            "%PROJECT_ROOT%/venv/lib/site-packages/someLib/__init__.py" to "someLib/__init__.py"
        )
    }

    private fun addPythonHandler(path: String): PyFunction {
        val psiFile = projectRule.fixture.addFileToProject(
            path,
            """
                def handle(event, context):
                    return "HelloWorld"
                """.trimIndent()
        ) as PyFile

        return runInEdtAndGet {
            psiFile.findTopLevelFunction("handle")!!
        }
    }

    private fun runPackager(module: Module, handler: PsiElement): LambdaPackage {
        LocalFileSystem.getInstance().refresh(false)

        val completableFuture = runInEdtAndGet {
            packager.buildLambda(module, handler, "app.handle", Runtime.PYTHON3_6)
        }

        return completableFuture.toCompletableFuture().get(30, TimeUnit.SECONDS)
    }

    private fun verifyExpectedEntries(lambdaPackage: LambdaPackage, vararg entries: String) {
        val basePath = lambdaPackage.codeLocation.toString()
        val lambdaEntries = Files.list(lambdaPackage.codeLocation)
            .map { it.toString().removePrefix(basePath) }
            .toList()
        assertThat(lambdaEntries).containsExactlyInAnyOrder(*entries)
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