// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver.ClassResolverKey
import software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver.CodeWhispererClassResolver
import software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver.CodeWhispererPythonClassResolver

object PythonCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "py"
    override val dialects: Set<String> = setOf("py")
    override val testFileNamingPatterns: List<Regex> = listOf(
        Regex("""^test_(.+)(\.py)$"""),
        Regex("""^(.+)_test(\.py)$""")
    )

    override suspend fun listFilesImported(psiFile: PsiFile): List<VirtualFile> = emptyList()

    override fun findSourceFileByName(target: PsiFile): VirtualFile? = super.listFilesUnderProjectRoot(target.project).find {
        !it.isDirectory &&
            it.isWritable &&
            it.name != target.virtualFile.name &&
            it.name == guessSourceFileName(target.name)
    }

    /**
     * check files in editors and pick one which has most substring matches to the target
     */
    override fun findSourceFileByContent(target: PsiFile): VirtualFile? = searchRelevantFileInEditors(target) { myPsiFile ->
        CodeWhispererClassResolver.EP_NAME.findFirstSafe { it is CodeWhispererPythonClassResolver }?.let {
            val classAndMethos = it.resolveClassAndMembers(myPsiFile)
            val clazz = classAndMethos[ClassResolverKey.ClassName].orEmpty()
            val methods = classAndMethos[ClassResolverKey.MethodName].orEmpty()
            val func = it.resolveTopLevelFunction(myPsiFile)

            clazz + methods + func
        }.orEmpty()
    }
}
