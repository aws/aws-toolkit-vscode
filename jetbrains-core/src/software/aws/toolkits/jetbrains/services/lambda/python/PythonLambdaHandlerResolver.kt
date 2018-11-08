// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
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
    override fun version(): Int = 1

    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> =
        determineHandler(element)?.let { setOf(it) }.orEmpty()

    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        // <f/old/ers>.<par.ent.module.s.<module>.<function>
        val functionName = handler.substringAfterLast('.')
        var remainder = handler.substringBeforeLast('.')

        val moduleStartIndex = remainder.lastIndexOfAny(charArrayOf('.', '/'))
        if (moduleStartIndex < 0) return NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY

        val moduleName = remainder.substring(moduleStartIndex + 1)
        val isReferencedByModule = remainder[moduleStartIndex] == '.'

        remainder = remainder.substring(0, remainder.length - moduleName.length - 1)

        val parentModules = if (isReferencedByModule) {
            remainder.substringAfterLast("/").split('.')
        } else {
            emptyList()
        }

        val parentFolders = if (isReferencedByModule) {
            remainder.substringBeforeLast("/", "").nullize(true)?.split('/') ?: emptyList()
        } else {
            remainder.split('/')
        }

        // Find the module by the name
        PyModuleNameIndex.find(moduleName, project, true).forEach { pyModule ->
            val lambdaFunctionCandidate = pyModule.findTopLevelFunction(functionName) ?: return@forEach

            val module = ModuleUtilCore.findModuleForFile(lambdaFunctionCandidate.containingFile)

            if (validateHandlerPath(module, pyModule, isReferencedByModule, parentModules, parentFolders)) {
                return arrayOf(lambdaFunctionCandidate)
            }
        }

        return NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
    }

    private fun validateHandlerPath(
        module: Module?,
        pyModule: PyFile,
        isReferencedByModule: Boolean,
        parentModules: List<String>,
        parentFolders: List<String>
    ): Boolean {
        // Start matching to see if the parent folders align
        var directory = pyModule.containingDirectory

        // If we are accessing the handler by module (aka with a .), it needs an init
        if (isReferencedByModule && !directoryHasInitPy(directory)) {
            return false
        }

        // Go from deepest back up
        parentModules.reversed().forEach { parentModule ->
            if (parentModule != directory?.name || !directoryHasInitPy(directory)) {
                return false
            }
            directory = directory.parentDirectory
        }

        parentFolders.reversed().forEach { folder ->
            if (folder != directory?.name) {
                return false
            }
            directory = directory.parentDirectory
        }

        val rootVirtualFile = directory.virtualFile
        module?.let {
            val rootManager = ModuleRootManager.getInstance(module)
            if (rootManager.contentRoots.contains(rootVirtualFile)) {
                return true
            }

            if (rootManager.getSourceRoots(false).contains(rootVirtualFile)) {
                return true
            }

            return false
        }

        return true
    }

    private fun directoryHasInitPy(psiDirectory: PsiDirectory) = psiDirectory.findFile("__init__.py") != null

    override fun determineHandler(element: PsiElement): String? {
        if (element.node?.elementType != PyTokenTypes.IDENTIFIER) {
            return null
        }
        val function = element.parent as? PyFunction ?: return null
        if (function.parent is PyFile && function.parameterList.parameters?.size == 2) {
            return function.qualifiedName
        }
        return null
    }
}