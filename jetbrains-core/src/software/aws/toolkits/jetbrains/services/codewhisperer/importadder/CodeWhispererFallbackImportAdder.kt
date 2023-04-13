// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileTypes.PlainTextLanguage
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage

/**
 * This class provides a fallback implementation of the CodeWhispererImportAdder abstract class for handling
 * import statements for Java, Python, and JavaScript files in cases when the respective language plugins are not
 * installed. It is meant to be generic and create bare import elements and insert them to the top of the file.
 */
class CodeWhispererFallbackImportAdder : CodeWhispererImportAdder() {
    override val supportedLanguages: List<CodeWhispererProgrammingLanguage> = listOf(
        CodeWhispererUnknownLanguage.INSTANCE
    )
    override val dummyFileName: String = "test.txt"

    override fun createNewImportPsiElement(psiFile: PsiFile, statement: String): PsiElement? {
        val statementWithNewLine = if (statement.endsWith("\n")) statement else "$statement\n"
        val project = psiFile.project
        val fileFactory = PsiFileFactory.getInstance(project)
        val dummyFile = fileFactory.createFileFromText(dummyFileName, PlainTextLanguage.INSTANCE, statementWithNewLine)
            ?: return null
        return dummyFile.firstChild
    }

    /**
     * Always returns null, as duplicates are not checked in the fallback implementation.
     */
    override fun hasDuplicatedImportsHelper(newImport: PsiElement, existingImports: List<PsiElement>): PsiElement? = null

    /**
     * Always returns an empty list, as top-level imports are not checked in the fallback implementation.
     */
    override fun getTopLevelImports(psiFile: PsiFile, editor: Editor): List<PsiElement> = emptyList()

    /**
     * Always returns an empty list, as local imports are not checked in the fallback implementation.
     */
    override fun getLocalImports(psiFile: PsiFile, editor: Editor): List<PsiElement> = emptyList()

    /**
     * Adds the new import statement to the beginning of the file.
     */
    override fun addImport(psiFile: PsiFile, editor: Editor, newImport: PsiElement): Boolean {
        val first = psiFile.firstChild
        if (first == null) {
            psiFile.add(newImport)
        } else {
            psiFile.addBefore(newImport, first)
        }
        return true
    }
}
