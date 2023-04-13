// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.lang.java.JavaLanguage
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.PsiImportStatement
import com.intellij.psi.PsiImportStatementBase
import com.intellij.psi.PsiJavaFile
import com.intellij.util.IncorrectOperationException
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava

class CodeWhispererJavaImportAdder : CodeWhispererImportAdder() {
    override val supportedLanguages: List<CodeWhispererProgrammingLanguage> = listOf(CodeWhispererJava.INSTANCE)
    override val dummyFileName: String = "dummy.java"

    override fun createNewImportPsiElement(psiFile: PsiFile, statement: String): PsiElement? {
        val project = psiFile.project
        val fileFactory = PsiFileFactory.getInstance(project)
        val dummyFile = fileFactory.createFileFromText(dummyFileName, JavaLanguage.INSTANCE, statement)
            as? PsiJavaFile ?: return null
        return dummyFile.importList?.allImportStatements?.getOrNull(0)
    }

    override fun hasDuplicatedImportsHelper(newImport: PsiElement, existingImports: List<PsiElement>): PsiElement? {
        if (newImport !is PsiImportStatement) return newImport
        existingImports.forEach {
            if (it !is PsiImportStatementBase) return@forEach
            if (it.text == newImport.text) return it
        }
        return null
    }

    override fun getTopLevelImports(psiFile: PsiFile, editor: Editor): List<PsiElement> {
        if (psiFile !is PsiJavaFile) return emptyList()
        return psiFile.importList?.allImportStatements?.toList().orEmpty()
    }

    override fun getLocalImports(psiFile: PsiFile, editor: Editor): List<PsiElement> = emptyList()

    override fun addImport(psiFile: PsiFile, editor: Editor, newImport: PsiElement): Boolean {
        if (psiFile !is PsiJavaFile) return false
        if (newImport !is PsiImportStatement) return false

        val addedImport =
            try {
                psiFile.importList?.add(newImport) ?: return false
            } catch (e: IncorrectOperationException) {
                return false
            }
        if (addedImport !is PsiImportStatement) return false
        return true
    }
}
