// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.jetbrains.python.psi.PyFile
import org.jetbrains.jps.model.java.JavaModuleSourceRootTypes

object PythonCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "py"
    override val testFilenamePattern: Regex = Regex("""(?:test_([^/\\]+)\.py|([^/\\]+)_test\.py)${'$'}""")
    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun guessSourceFileName(tstFileName: String): String {
        assert(testFilenamePattern.matches(tstFileName))
        return tstFileName.substring(5)
    }

    override fun listFilesWithinSamePackage(psiFile: PsiFile): List<VirtualFile> {
        val targetPackagePath = psiFile.virtualFile.let {
            it.path.removeSuffix(it.name)
        }
        return listFilesUnderProjectRoot(psiFile.project).filter {
            val packagePath = it.path.removeSuffix(it.name)
            targetPackagePath == packagePath && it != psiFile.virtualFile
        }
    }

    override fun findFocalFileForTest(psiFile: PsiFile): VirtualFile? = findSourceFileByName(psiFile) ?: findRelevantFileFromEditors(psiFile)

    private fun findSourceFileByName(psiFile: PsiFile): VirtualFile? {
        val module = ModuleUtilCore.findModuleForFile(psiFile)

        return module?.rootManager?.getSourceRoots(JavaModuleSourceRootTypes.PRODUCTION)?.let { srcRoot ->
            srcRoot
                .map { root -> VfsUtil.collectChildrenRecursively(root) }
                .flatten()
                .find { !it.isDirectory && it.isWritable && it.name.contains(guessSourceFileName(psiFile.name)) }
        }
    }

    /**
     * check files in editors and pick one which has most substring matches to the target
     */
    private fun findRelevantFileFromEditors(psiFile: PsiFile): VirtualFile? = searchRelevantFileInEditors(psiFile) { myPsiFile ->
        if (myPsiFile !is PyFile) {
            return@searchRelevantFileInEditors emptyList()
        }

        val classAndMethod = runReadAction {
            myPsiFile.topLevelClasses.mapNotNull {
                listOfNotNull(it.name) + it.methods.mapNotNull { method -> method.name }
            }.flatten()
        }

        val topLevelFunc = runReadAction {
            myPsiFile.topLevelFunctions.mapNotNull { it.name }
        }

        classAndMethod + topLevelFunc
    }
}
