// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.TestSourcesFilter
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.text.nullize
import com.jetbrains.python.PyTokenTypes
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import com.jetbrains.python.psi.stubs.PyModuleNameIndex
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class PythonLambdaHandlerResolver : LambdaHandlerResolver {
    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> =
        determineHandler(element)?.let { setOf(it) }.orEmpty()

    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        if (!handler.contains('.')) {
            return NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
        }
        // [par/rent/fold/ers/][module.folders.]moduleFile.functionName
        val functionName = handler.substringAfterLast('.')
        val parentFolders = handler.substringBeforeLast('/', "").nullize(true)?.split("/") ?: emptyList()

        val fullyQualifiedModule = handler.substringAfterLast('/').substringBeforeLast('.').split('.')
        val moduleFile = fullyQualifiedModule.last()
        val moduleFolders = fullyQualifiedModule.take(fullyQualifiedModule.size - 1)

        // Find the module by the name
        PyModuleNameIndex.find(moduleFile, project, false).forEach { pyModule ->
            val lambdaFunctionCandidate = pyModule.findTopLevelFunction(functionName) ?: return@forEach
            if (validateHandlerPath(pyModule, moduleFolders, parentFolders)) {
                return arrayOf(lambdaFunctionCandidate)
            }
        }

        return NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
    }

    private fun validateHandlerPath(
        pyModule: PyFile,
        parentModuleFolders: List<String>,
        parentFolders: List<String>
    ): Boolean {
        // Start matching to see if the parent folders align
        var directory = pyModule.containingDirectory
        val hasRequirementsTxt = { directory.virtualFile.findChild("requirements.txt") != null }

        // Go from the deepest back up until we find a requirements.txt
        // SAM CLI will strictly use requirements.txt in the directory defined by CodeUri, but we don't have that data here
        parentModuleFolders.reversed().forEach { parentModule ->
            if (parentModule != directory?.name || !directoryHasInitPy(directory)) {
                return false
            }

            if (hasRequirementsTxt()) {
                return true
            }

            directory = directory.parentDirectory
        }

        parentFolders.reversed().forEach { folder ->
            if (folder != directory?.name) {
                return false
            }

            if (hasRequirementsTxt()) {
                return true
            }

            directory = directory.parentDirectory
        }

        if (hasRequirementsTxt()) {
            return true
        } else {
            throw IllegalStateException("Failed to locate requirements.txt")
        }
    }

    private fun directoryHasInitPy(psiDirectory: PsiDirectory) = psiDirectory.findFile("__init__.py") != null

    override fun determineHandler(element: PsiElement): String? {
        if (element.node?.elementType != PyTokenTypes.IDENTIFIER) {
            return null
        }
        val project = element.project
        val function = element.parent as? PyFunction ?: return null
        val virtualFile = element.containingFile.virtualFile ?: return null

        if (function.parent is PyFile &&
            function.parameterList.parameters.size == 2 &&
            // Ignore files that are considered test sources. Ignore the IDE warning, it uses IDE extension points.
            !TestSourcesFilter.isTestSources(virtualFile, project) &&
            // ignore pytest tests: they start with test_ by convention:
            // https://pytest.readthedocs.io/en/reorganize-docs/new-docs/user/naming_conventions.html#id1
            function.name?.startsWith("test_") != true
        ) {
            val requirementsFileDir = runCatching { PythonLambdaBuilder.locateRequirementsTxt(virtualFile).parent }.getOrNull() ?: return null
            val filePath = if (virtualFile.parent != requirementsFileDir) {
                VfsUtil.getRelativePath(virtualFile.parent, requirementsFileDir)?.let { "$it/" } ?: return null
            } else {
                ""
            }
            return "$filePath${virtualFile.nameWithoutExtension}.${function.name}"
        }
        return null
    }
}
