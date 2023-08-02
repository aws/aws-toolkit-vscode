// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.TestSourcesFilter
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage

/**
 * An interface define how do we parse and fetch files provided a psi file or project
 * since different language has its own way importing other files or its own naming style for test file
 */
interface FileCrawler {
    /**
     * parse the import statements provided a file
     * @param psiFile of the file we are search with
     * @return list of file reference from the import statements
     */
    suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile>

    fun listFilesUnderProjectRoot(project: Project): List<VirtualFile>

    /**
     * @param psiFile the file we are searching with, aka target file
     * @return Files under the same package as the given file and exclude the given file
     */
    fun listFilesWithinSamePackage(psiFile: PsiFile): List<VirtualFile>

    /**
     * should be invoked at test files e.g. MainTest.java, or test_main.py
     * @param psiFile psi of the test file we are searching with, e.g. MainTest.java
     * @return its source file e.g. Main.java, main.py or most relevant file if any
     */
    fun findFocalFileForTest(psiFile: PsiFile): VirtualFile?

    /**
     * List files opened in the editors and sorted by file distance @see [CodeWhispererFileCrawler.getFileDistance]
     */
    fun listRelevantFilesInEditors(psiFile: PsiFile): List<VirtualFile>
}

class NoOpFileCrawler : FileCrawler {
    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun listFilesUnderProjectRoot(project: Project): List<VirtualFile> = emptyList()
    override fun findFocalFileForTest(psiFile: PsiFile): VirtualFile? = null

    override fun listFilesWithinSamePackage(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun listRelevantFilesInEditors(psiFile: PsiFile): List<VirtualFile> = emptyList()
}

abstract class CodeWhispererFileCrawler : FileCrawler {
    abstract val fileExtension: String
    abstract val testFilenamePattern: Regex
    abstract val dialects: Set<String>

    override fun listFilesUnderProjectRoot(project: Project): List<VirtualFile> = project.guessProjectDir()?.let { rootDir ->
        VfsUtil.collectChildrenRecursively(rootDir).filter {
            it.path.endsWith(fileExtension)
        }
    }.orEmpty()

    override fun listRelevantFilesInEditors(psiFile: PsiFile): List<VirtualFile> {
        val targetFile = psiFile.virtualFile
        val language = psiFile.programmingLanguage()

        val isTestFilePredicate: (file: VirtualFile, project: Project) -> Boolean = if (language is CodeWhispererJava) {
            { file, project -> TestSourcesFilter.isTestSources(file, project) }
        } else {
            { file, _ -> testFilenamePattern.matches(file.name) }
        }

        val openedFiles = runReadAction {
            FileEditorManager.getInstance(psiFile.project).openFiles.toList().filter {
                it.name != psiFile.virtualFile.name &&
                    isSameDialect(it.extension) &&
                    !isTestFilePredicate(it, psiFile.project)
            }
        }

        val fileToFileDistanceList = runReadAction {
            openedFiles.map {
                return@map it to CodeWhispererFileCrawler.getFileDistance(targetFile = targetFile, candidateFile = it)
            }
        }

        return fileToFileDistanceList.sortedBy { it.second }.map { it.first }
    }

    abstract fun guessSourceFileName(tstFileName: String): String

    private fun isSameDialect(fileExt: String?): Boolean = fileExt?.let {
        dialects.contains(fileExt)
    } ?: false

    companion object {
        fun searchRelevantFileInEditors(target: PsiFile, keywordProducer: (psiFile: PsiFile) -> List<String>): VirtualFile? {
            val project = target.project
            val targetElements = keywordProducer(target)

            return runReadAction {
                FileEditorManager.getInstance(project).openFiles
                    .filter { openedFile ->
                        openedFile.name != target.virtualFile.name && openedFile.extension == target.virtualFile.extension
                    }
                    .mapNotNull { openedFile -> PsiManager.getInstance(project).findFile(openedFile) }
                    .maxByOrNull {
                        val elementsToCheck = keywordProducer(it)
                        countSubstringMatches(targetElements, elementsToCheck)
                    }?.virtualFile
            }
        }

        /**
         * how many elements in elementsToCheck is contained (as substring) in targetElements
         */
        fun countSubstringMatches(targetElements: List<String>, elementsToCheck: List<String>): Int = elementsToCheck.fold(0) { acc, elementToCheck ->
            val hasTarget = targetElements.any { it.contains(elementToCheck, ignoreCase = true) }
            if (hasTarget) {
                acc + 1
            } else {
                acc
            }
        }

        /**
         * For [LocalFileSystem](implementation of virtual file system), the path will be an absolute file path with file separator characters replaced
         * by forward slash "/"
         * @see [VirtualFile.getPath]
         */
        fun getFileDistance(targetFile: VirtualFile, candidateFile: VirtualFile): Int {
            val targetFilePaths = targetFile.path.split("/").dropLast(1)
            val candidateFilePaths = candidateFile.path.split("/").dropLast(1)

            var i = 0
            while (i < minOf(targetFilePaths.size, candidateFilePaths.size)) {
                val dir1 = targetFilePaths[i]
                val dir2 = candidateFilePaths[i]

                if (dir1 != dir2) {
                    break
                }

                i++
            }

            return targetFilePaths.subList(fromIndex = i, toIndex = targetFilePaths.size).size +
                candidateFilePaths.subList(fromIndex = i, toIndex = candidateFilePaths.size).size
        }
    }
}
