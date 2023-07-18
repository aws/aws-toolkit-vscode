// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.roots.TestSourcesFilter
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiClassOwner
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiJavaFile
import com.intellij.psi.PsiPackage
import com.intellij.psi.search.GlobalSearchScope
import kotlinx.coroutines.yield
import org.jetbrains.jps.model.java.JavaModuleSourceRootTypes

// version1: Utilize PSI import elements to resolve imported files
object JavaCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = ".java"
    override val testFilenamePattern: Regex = """(?:Test([^/\\]+)\.java|([^/\\]+)Test\.java)$""".toRegex()

    override fun guessSourceFileName(tstFileName: String): String = tstFileName.substring(0, tstFileName.length - "Test.java".length) + ".java"

    override fun listRelevantFilesInEditors(psiFile: PsiFile): List<VirtualFile> {
        val targetFile = psiFile.virtualFile

        val openedFiles = FileEditorManager.getInstance(psiFile.project).openFiles.toList().filter {
            it.name != psiFile.virtualFile.name &&
                it.extension == psiFile.virtualFile.extension &&
                !TestSourcesFilter.isTestSources(it, psiFile.project)
        }

        val fileToFileDistanceList = openedFiles.map {
            return@map it to CodeWhispererFileCrawler.getFileDistance(targetFile = targetFile, candidateFile = it)
        }

        return fileToFileDistanceList.sortedBy { it.second }.map { it.first }
    }

    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> {
        if (psiFile !is PsiJavaFile) return emptyList()
        val result = mutableListOf<VirtualFile>()
        val imports = runReadAction { psiFile.importList?.allImportStatements }
        val activeFiles = FileEditorManager.getInstance(psiFile.project).openFiles.toSet()

        // only consider imported files which belong users' own package, thus [isInLocalFileSystem && isWritable]
        val fileHandleLambda = { virtualFile: VirtualFile ->
            if (virtualFile.isInLocalFileSystem && virtualFile.isWritable) {
                // prioritize active files on users' editor
                if (activeFiles.contains(virtualFile)) {
                    result.add(0, virtualFile)
                } else {
                    result.add(virtualFile)
                }
            }
        }

        imports?.forEach {
            yield()
            runReadAction { it.resolve() }?.let { psiElement ->
                // case like import javax.swing.*;
                if (psiElement is PsiPackage) {
                    val filesInPackage = psiElement.getFiles(GlobalSearchScope.allScope(psiFile.project)).mapNotNull { it.virtualFile }
                    filesInPackage.forEach { file ->
                        fileHandleLambda(file)
                    }
                } else {
                    // single file import
                    runReadAction {
                        psiElement.containingFile.virtualFile?.let { virtualFile ->
                            // file within users' project
                            fileHandleLambda(virtualFile)
                        }
                    }
                }
            }
        }

        return result
    }

    override fun listFilesWithinSamePackage(targetFile: PsiFile): List<VirtualFile> = runReadAction {
        targetFile.containingDirectory?.files?.mapNotNull {
            // exclude target file
            if (it != targetFile) {
                it.virtualFile
            } else {
                null
            }
        }.orEmpty()
    }

    override fun findFocalFileForTest(psiFile: PsiFile): VirtualFile? = findSourceFileByName(psiFile) ?: findRelevantFileFromEditors(psiFile)

    // psiFile = "MainTest.java", targetFileName = "Main.java"
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
        if (myPsiFile !is PsiClassOwner) {
            return@searchRelevantFileInEditors emptyList()
        }

        val classAndMethod = runReadAction {
            myPsiFile.classes.mapNotNull { clazz ->
                listOfNotNull(clazz.name) + clazz.methods.mapNotNull { method -> method.name }
            }.flatten()
        }

        classAndMethod
    }
}
