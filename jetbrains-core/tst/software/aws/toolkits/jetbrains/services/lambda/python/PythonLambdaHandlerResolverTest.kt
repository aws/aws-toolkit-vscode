// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.python.psi.PyFunction
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule

class PythonLambdaHandlerResolverTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun findWorksByPath() {
        createHandler("hello_world/app.py")

        assertHandler("hello_world/app.handle", true)
    }

    @Test
    fun findWorksByPathWithInit() {
        createHandler("hello_world/app.py")
        createInitPy("hello_world")

        assertHandler("hello_world/app.handle", true)
    }

    @Test
    fun findDoesntWorkByModule() {
        createHandler("hello_world/app.py")

        assertHandler("hello_world.app.handle", false)
    }

    @Test
    fun findWorksByModuleWithInit() {
        createHandler("hello_world/app.py")
        createInitPy("hello_world")

        assertHandler("hello_world.app.handle", true)
    }

    @Test
    fun findWorksInSubFolderByPath() {
        createHandler("hello_world/foo_bar/app.py")

        assertHandler("hello_world/foo_bar/app.handle", true)
    }

    @Test
    fun findWorksInSubFolderByPathWithInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world/foo_bar")

        assertHandler("hello_world/foo_bar/app.handle", true)
    }

    @Test
    fun findDoesntWorkWithPathAndModule() {
        createHandler("hello_world/foo_bar/app.py")

        assertHandler("hello_world/foo_bar.app.handle", false)
    }

    @Test
    fun findWorksWithPathAndModuleWithInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world/foo_bar")

        assertHandler("hello_world/foo_bar.app.handle", true)
    }

    @Test
    fun findWorksWithSubmodulesWithInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world")
        createInitPy("hello_world/foo_bar")

        assertHandler("hello_world.foo_bar.app.handle", true)
    }

    @Test
    fun findDoesntWorkWithSubmodulesWithMissingInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world/foo_bar")

        assertHandler("hello_world.foo_bar.app.handle", false)
    }

    @Test
    fun findWorksIfHandlerRootIsASourceDirectory() {
        val virtualFile = createHandler("src/hello_world/foo_bar/app.py")
        createInitPy("src/hello_world/foo_bar")
        createInitPy("src/hello_world")

        markAsSourceRoot(virtualFile.parent.parent) // hello_world

        assertHandler("hello_world.foo_bar.app.handle", true)
    }

    @Test
    fun findDoesntWorkIfNotASourceOrContentRoot() {
        createHandler("src/hello_world/foo_bar/app.py")
        createInitPy("src/hello_world")
        createInitPy("src/hello_world/foo_bar")

        assertHandler("hello_world.foo_bar.app.handle", false)
    }

    @Test
    fun findDoesntWorkIfParentFolderDoesntExist() {
        createHandler("src/hello_world/foo_bar/app.py")
        createInitPy("src/hello_world/foo_bar")

        assertHandler("doesnt_exist/foo_bar.app.handle", false)
    }

    @Test
    fun invalidHandlerReturnsNothing() {
        createHandler("hello_world/app.py")

        assertHandler("doesnt_exist", false)
    }

    @Test
    fun findWorksByTopLevelModule() {
        createHandler("app.py")

        assertHandler("app.handle", true)
    }

    @Test
    fun findWorkIfRequirementsFileIsFound() {
        createHandler("src/hello_world/foo_bar/app.py")
        createInitPy("src/hello_world")
        createInitPy("src/hello_world/foo_bar")
        projectRule.fixture.addFileToModule(projectRule.module, "src/requirements.txt", "")

        assertHandler("hello_world.foo_bar.app.handle", true)
    }

    private fun createHandler(path: String): VirtualFile = projectRule.fixture.addFileToProject(
        path,
        """
        def handle(event, context):
            return "HelloWorld"
        """.trimIndent()
    ).virtualFile

    private fun createInitPy(path: String) {
        projectRule.fixture.addFileToModule(projectRule.module, "$path/__init__.py", "")
    }

    private fun markAsSourceRoot(virtualFile: VirtualFile) {
        ModuleRootModificationUtil.updateModel(projectRule.module) {
            it.contentEntries[0].addSourceFolder(virtualFile.parent, false)
        }
    }

    private fun assertHandler(handler: String, shouldBeFound: Boolean) {
        runInEdtAndWait {
            val elements = findHandler(handler)
            if (shouldBeFound) {
                assertThat(elements).hasSize(1)
                assertThat(elements[0]).isInstanceOf(PyFunction::class.java)
            } else {
                assertThat(elements).isEmpty()
            }
        }
    }

    private fun findHandler(handler: String): Array<NavigatablePsiElement> =
        Lambda.findPsiElementsForHandler(projectRule.project, Runtime.PYTHON3_6, handler)
}
