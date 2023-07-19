// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile

object JavascriptCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "js"
    override val dialects: Set<String> = setOf("js", "jsx")

    // TODO: Add implementation when UTG is enabled
    override val testFilenamePattern: Regex = "".toRegex()

    // TODO: Add implementation when UTG is enabled
    override fun guessSourceFileName(tstFileName: String): String = ""

    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun listFilesWithinSamePackage(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun findFocalFileForTest(psiFile: PsiFile): VirtualFile? = null
}
