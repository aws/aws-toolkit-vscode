// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.lang.ecmascript6.psi.ES6ImportDeclaration
import com.intellij.lang.javascript.JavascriptLanguage
import com.intellij.lang.javascript.psi.JSBlockStatement
import com.intellij.lang.javascript.psi.JSFile
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.util.PsiTreeUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx

class CodeWhispererJSImportAdder : CodeWhispererImportAdder() {
    override val supportedLanguages: List<CodeWhispererProgrammingLanguage> = listOf(
        CodeWhispererJavaScript.INSTANCE,
        CodeWhispererJsx.INSTANCE
    )
    override val dummyFileName: String = "dummy.js"

    override fun createNewImportPsiElement(psiFile: PsiFile, statement: String): PsiElement? {
        val fileFactory = PsiFileFactory.getInstance(psiFile.project)
        val dummyFile = fileFactory.createFileFromText(dummyFileName, JavascriptLanguage.INSTANCE, statement)
            as? JSFile ?: return null
        return dummyFile.children.find { it is ES6ImportDeclaration }
    }

    override fun hasDuplicatedImportsHelper(newImport: PsiElement, existingImports: List<PsiElement>): PsiElement? {
        if (newImport !is ES6ImportDeclaration) return newImport
        newImport.importSpecifiers.forEach { newImportSpecifier ->
            existingImports.forEach outer@{ existingImport ->
                if (existingImport !is ES6ImportDeclaration) return@outer
                existingImport.importSpecifiers.forEach { existingImportSpecifier ->
                    if (existingImportSpecifier.referenceName == newImportSpecifier.referenceName &&
                        existingImportSpecifier.declaredName == newImportSpecifier.declaredName
                    ) {
                        return existingImport
                    }
                }
            }
        }
        return null
    }

    override fun getTopLevelImports(psiFile: PsiFile, editor: Editor): List<PsiElement> =
        psiFile.children.filterIsInstance<ES6ImportDeclaration>()

    override fun getLocalImports(psiFile: PsiFile, editor: Editor): List<PsiElement> {
        val localImports = mutableListOf<PsiElement>()
        val offset = editor.caretModel.offset
        val element = psiFile.findElementAt(offset)
        var block: PsiElement? = PsiTreeUtil.getParentOfType(element, JSBlockStatement::class.java)
        while (block != null) {
            localImports.addAll(block.children.filterIsInstance<ES6ImportDeclaration>())
            block = PsiTreeUtil.getParentOfType(block, JSBlockStatement::class.java)
        }
        return localImports
    }

    override fun isSupportedImportStyle(newImport: PsiElement): Boolean {
        if (newImport !is ES6ImportDeclaration) return false

        // We currently don't expect BARE import type
        if (newImport.importModuleText != null) return false

        if (newImport.fromClause?.referenceText == null) return false
        return true
    }

    override fun addImport(psiFile: PsiFile, editor: Editor, newImport: PsiElement): Boolean {
        if (newImport !is ES6ImportDeclaration) return false
        CodeWhispererJSImportUtil.insert(psiFile, newImport)
        return true
    }
}
