// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.jetbrains.python.psi.PyFile

object PythonCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "py"
    override val dialects: Set<String> = setOf("py")
    override val testFileNamingPatterns: List<Regex> = listOf(
        Regex("""^test_(.+)(\.py)$"""),
        Regex("""^(.+)_test(\.py)$""")
    )

    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun findSourceFileByName(psiFile: PsiFile): VirtualFile? = super.listFilesUnderProjectRoot(psiFile.project).find {
        !it.isDirectory &&
            it.isWritable &&
            it.name != psiFile.virtualFile.name &&
            it.name == guessSourceFileName(psiFile.name)
    }

    /**
     * check files in editors and pick one which has most substring matches to the target
     */
    override fun findSourceFileByContent(psiFile: PsiFile): VirtualFile? = searchRelevantFileInEditors(psiFile) { myPsiFile ->
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
