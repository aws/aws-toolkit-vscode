// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import org.jetbrains.jps.model.java.JavaModuleSourceRootTypes
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver.ClassResolverKey
import software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver.CodeWhispereJavaClassResolver
import software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver.CodeWhispererClassResolver

object JavaCodeWhispererFileCrawler : CodeWhispererFileCrawler() {
    override val fileExtension: String = "java"
    override val dialects: Set<String> = setOf("java")
    override val testFileNamingPatterns = listOf(
        Regex("""^(.+)Test(\.java)$"""),
        Regex("""^(.+)Tests(\.java)$""")
    )

    // psiFile = "MainTest.java", targetFileName = "Main.java"
    override fun findSourceFileByName(target: PsiFile): VirtualFile? =
        guessSourceFileName(target.virtualFile.name)?.let { srcName ->
            val module = ModuleUtilCore.findModuleForFile(target)

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
    override fun findSourceFileByContent(target: PsiFile): VirtualFile? = searchRelevantFileInEditors(target) { myPsiFile ->
        CodeWhispererClassResolver.EP_NAME.findFirstSafe { it is CodeWhispereJavaClassResolver }?.let {
            val classAndMethods = it.resolveClassAndMembers(myPsiFile)
            val clazz = classAndMethods[ClassResolverKey.ClassName].orEmpty()
            val methods = classAndMethods[ClassResolverKey.MethodName].orEmpty()

            clazz + methods
        } ?: run {
            getLogger<JavaCodeWhispererFileCrawler>().warn {
                "could not resolve correct CwsprClassResolver, available CwsprClassResolver=${CodeWhispererClassResolver.EP_NAME.extensionList}"
            }
            emptyList()
        }
    }
}
