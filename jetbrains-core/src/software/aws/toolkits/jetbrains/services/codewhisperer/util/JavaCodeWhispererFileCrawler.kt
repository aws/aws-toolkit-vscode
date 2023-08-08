// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiClassOwner
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiJavaFile
import com.intellij.psi.PsiPackage
import com.intellij.psi.search.GlobalSearchScope
import kotlinx.coroutines.yield
import org.jetbrains.jps.model.java.JavaModuleSourceRootTypes

object JavaCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "java"
    override val dialects: Set<String> = setOf("java")
    override val testFileNamingPatterns = listOf(
        Regex("""^(.+)Test(\.java)$"""),
        Regex("""^(.+)Tests(\.java)$""")
    )

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

    // psiFile = "MainTest.java", targetFileName = "Main.java"
    override fun findSourceFileByName(psiFile: PsiFile): VirtualFile? =
        guessSourceFileName(psiFile.virtualFile.name)?.let { srcName ->
            val module = ModuleUtilCore.findModuleForFile(psiFile)

            module?.rootManager?.getSourceRoots(JavaModuleSourceRootTypes.PRODUCTION)?.let { srcRoot ->
                srcRoot
                    .map { root -> VfsUtil.collectChildrenRecursively(root) }
                    .flatten()
                    .find { !it.isDirectory && it.isWritable && it.name == srcName }
            }
        }

    /**
     * check files in editors and pick one which has most substring matches to the target
     */
    override fun findSourceFileByContent(psiFile: PsiFile): VirtualFile? = searchRelevantFileInEditors(psiFile) { myPsiFile ->
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
