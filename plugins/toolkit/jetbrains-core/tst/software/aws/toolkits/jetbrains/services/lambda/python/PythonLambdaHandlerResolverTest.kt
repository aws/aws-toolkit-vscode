// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.testFramework.PsiTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.python.psi.PyFunction
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule

class PythonLambdaHandlerResolverTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun `finds requirementsTxt inside source root`() {
        createHandler("hello_world/app.py")
        createRequirementsTxt("hello_world")

        assertHandler("hello_world/app.handle", true)
    }

    @Test
    fun findWorksByPath() {
        createHandler("hello_world/app.py")
        createRequirementsTxt(".")

        assertHandler("hello_world/app.handle", true)
    }

    @Test
    fun findWorksByPathWithInit() {
        createHandler("hello_world/app.py")
        createInitPy("hello_world")
        createRequirementsTxt(".")

        assertHandler("hello_world/app.handle", true)
    }

    @Test
    fun findDoesntWorkIfNoRequirementsFound() {
        createHandler("hello_world/app.py")

        assertHandler("hello_world.app.handle", false)
    }

    @Test
    fun findWorksByModuleWithInit() {
        createHandler("hello_world/app.py")
        createInitPy("hello_world")
        createRequirementsTxt(".")

        assertHandler("hello_world.app.handle", true)
    }

    @Test
    fun findWorksInSubFolderByPath() {
        createHandler("hello_world/foo_bar/app.py")
        createRequirementsTxt("hello_world")

        assertHandler("foo_bar/app.handle", true)
    }

    @Test
    fun findWorksInSubFolderByPathWithInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world/foo_bar")
        createRequirementsTxt("hello_world")

        assertHandler("foo_bar.app.handle", true)
    }

    @Test
    fun findDoesntWorkWithPathAndModuleWithoutInit() {
        createHandler("hello_world/foo_bar/app.py")
        createRequirementsTxt(".")

        assertHandler("hello_world/foo_bar.app.handle", false)
    }

    @Test
    fun findWorksWithPathAndModuleWithInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world/foo_bar")
        createRequirementsTxt(".")

        assertHandler("hello_world/foo_bar.app.handle", true)
    }

    @Test
    fun findWorksWithSubmodulesWithInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world")
        createInitPy("hello_world/foo_bar")
        createRequirementsTxt(".")

        assertHandler("hello_world.foo_bar.app.handle", true)
    }

    @Test
    fun findDoesntWorkWithSubmodulesWithMissingInit() {
        createHandler("hello_world/foo_bar/app.py")
        createInitPy("hello_world/foo_bar")
        createRequirementsTxt(".")

        assertHandler("hello_world.foo_bar.app.handle", false)
    }

    @Test
    fun findWorksIfHandlerRootIsASourceDirectory() {
        val virtualFile = createHandler("src/hello_world/foo_bar/app.py")
        createInitPy("src/hello_world/foo_bar")
        createInitPy("src/hello_world")
        createRequirementsTxt("src")

        markAsSourceRoot(virtualFile.parent.parent) // hello_world

        assertHandler("hello_world.foo_bar.app.handle", true)
    }

    @Test
    fun findDoesntWorkIfParentFolderDoesntExist() {
        createHandler("src/hello_world/foo_bar/app.py")
        createInitPy("src/hello_world/foo_bar")
        createRequirementsTxt(".")

        assertHandler("doesnt_exist/foo_bar.app.handle", false)
    }

    @Test
    fun invalidHandlerReturnsNothing() {
        createHandler("hello_world/app.py")
        createRequirementsTxt(".")

        assertHandler("doesnt_exist", false)
    }

    @Test
    fun findWorksByTopLevelModule() {
        createHandler("app.py")
        createRequirementsTxt(".")

        assertHandler("app.handle", true)
    }

    @Test
    fun foundHandlersNotPythonFileInvalid() {
        createHandler("hello_world/foo_bar/app.java")
        createRequirementsTxt(".")

        assertHandler("hello_world/foo_bar/app.handle", false)
    }

    @Test
    fun foundHandlersAreDeterminedValid() {
        createHandler("hello_world/foo_bar/app.py")
        createRequirementsTxt(".")

        assertHandlerDetermineHandlers("hello_world/foo_bar/app.handle", false)
    }

    @Test
    fun pyTestHandlersAreDeterminedInvalid() {
        createPyTestHandler("hello_world/foo_bar/app.py")
        createRequirementsTxt(".")

        assertHandlerDetermineHandlers("hello_world/foo_bar/app.test_handle", true)
    }

    @Test
    fun testDirectoryHandlerHandlersAreDeterminedInvalid() {
        val vfs = createHandler("hello_world/foo_bar/app.py")
        createRequirementsTxt(".")
        PsiTestUtil.addSourceRoot(projectRule.module, vfs.parent, true)

        assertHandlerDetermineHandlers("hello_world/foo_bar/app.handle", true)
    }

    @Test
    fun foundHandlersOneArgumentIsDeterminedInvalid() {
        createInvalidHandler("hello_world/foo_bar/app.py", 1)
        createRequirementsTxt(".")

        assertHandlerDetermineHandlers("hello_world/foo_bar/app.handle", true)
    }

    @Test
    fun foundHandlersThreeArgumentsIsDeterminedInvalid() {
        createInvalidHandler("hello_world/foo_bar/app.py", 3)
        createRequirementsTxt(".")

        assertHandlerDetermineHandlers("hello_world/foo_bar/app.handle", true)
    }

    private fun createRequirementsTxt(folder: String): VirtualFile = projectRule.fixture.addFileToProject(
        folder + "/requirements.txt",
        ""
    ).virtualFile

    private fun createHandler(path: String): VirtualFile = projectRule.fixture.addFileToProject(
        path,
        """
        def handle(event, context):
            return "HelloWorld"
        """.trimIndent()
    ).virtualFile

    private fun createPyTestHandler(path: String): VirtualFile = projectRule.fixture.addFileToProject(
        path,
        """
        def test_handle(event, context):
            return "HelloWorld"
        """.trimIndent()
    ).virtualFile

    private fun createInvalidHandler(path: String, numberArguments: Int): VirtualFile = projectRule.fixture.addFileToProject(
        path,
        """
        def handle(${(1..numberArguments).joinToString(", ") { "a$it" } }):
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

    private fun assertHandlerDetermineHandlers(handler: String, shouldBeFilteredOut: Boolean) {
        runInEdtAndWait {
            val elementSet = findHandler(handler)
            assertThat(elementSet).hasSize(1)
            assertThat(elementSet[0]).isInstanceOf(PyFunction::class.java)
            val pyElement = elementSet[0] as PyFunction
            val elements = getHandlerResolver().determineHandlers(pyElement.identifyingElement!!, pyElement.containingFile.virtualFile)
            if (shouldBeFilteredOut) {
                assertThat(elements).isEmpty()
            } else {
                assertThat(elements).hasSize(1)
            }
        }
    }

    private fun getHandlerResolver() = Runtime.PYTHON3_9.runtimeGroup?.let { LambdaHandlerResolver.getInstanceOrNull(it) }!!
    private fun findHandler(handler: String): Array<NavigatablePsiElement> =
        Lambda.findPsiElementsForHandler(projectRule.project, Runtime.PYTHON3_9, handler)
}
