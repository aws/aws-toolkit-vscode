// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile

object TypescriptCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "ts"
    override val dialects: Set<String> = setOf("ts", "tsx")
    override val testFileNamingPatterns: List<Regex> = listOf(
        Regex("""^(.+)\.(?i:t)est(\.ts|\.tsx)$"""),
        Regex("""^(.+)\.(?i:s)pec(\.ts|\.tsx)$""")
    )

    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun findSourceFileByName(target: PsiFile): VirtualFile? = null

    override fun findSourceFileByContent(target: PsiFile): VirtualFile? = null
}
