// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.util.QualifiedName
import com.intellij.refactoring.suggested.startOffset
import com.jetbrains.python.PythonLanguage
import com.jetbrains.python.codeInsight.PyCodeInsightSettings
import com.jetbrains.python.codeInsight.imports.AddImportHelper
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFromImportStatement
import com.jetbrains.python.psi.PyImportStatement
import com.jetbrains.python.psi.PyImportStatementBase
import com.jetbrains.python.psi.PyStatementList
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython

class CodeWhispererPythonImportAdder : CodeWhispererImportAdder() {
    override val supportedLanguages: List<CodeWhispererProgrammingLanguage> = listOf(CodeWhispererPython.INSTANCE)
    override val dummyFileName: String = "dummy.py"

    override fun createNewImportPsiElement(psiFile: PsiFile, statement: String): PsiElement? {
        val fileFactory = PsiFileFactory.getInstance(psiFile.project)
        val dummyFile = fileFactory.createFileFromText(dummyFileName, PythonLanguage.INSTANCE, statement)
            as? PyFile ?: return null
        return dummyFile.importBlock.firstOrNull()
    }

    override fun hasDuplicatedImportsHelper(newImport: PsiElement, existingImports: List<PsiElement>): PsiElement? {
        if (newImport !is PyImportStatementBase) return newImport

        newImport.importElements.map { it.importedQName }.forEachIndexed outer@{ newI, newImportedQName ->
            if (newImportedQName == null) return@outer
            existingImports.forEach { existingImport ->
                if (existingImport !is PyImportStatementBase) return@outer
                if (existingImport::class.java != newImport::class.java) return@outer
                existingImport.importElements.map { it.importedQName }.forEachIndexed inner@{ existingI, existingImportedQName ->
                    if (existingImportedQName == null) return@inner
                    val existingImportAsName = existingImport.importElements[existingI].asName
                    val newImportAsName = newImport.importElements[newI].asName
                    if (existingImportAsName != newImportAsName) return@inner

                    val newFullyQName = QualifiedName.fromDottedString(newImport.fullyQualifiedObjectNames[newI])
                    val existingFullyQName = QualifiedName.fromDottedString(existingImport.fullyQualifiedObjectNames[existingI])
                    if (newImport is PyImportStatement) {
                        if (newImportAsName != null) {
                            if (existingFullyQName == newFullyQName) return existingImport
                        } else {
                            if (existingFullyQName.matchesPrefix(newFullyQName)) return existingImport
                        }
                    } else if (newImport is PyFromImportStatement) {
                        if (newImportedQName == existingImportedQName && newFullyQName == existingFullyQName) return existingImport
                    }
                }
            }
        }
        return null
    }

    override fun getTopLevelImports(psiFile: PsiFile, editor: Editor): List<PsiElement> =
        if (psiFile !is PyFile) emptyList() else psiFile.importBlock

    override fun getLocalImports(psiFile: PsiFile, editor: Editor): List<PsiElement> {
        val localImports = mutableListOf<PsiElement>()
        val offset = editor.caretModel.offset
        val element = psiFile.findElementAt(offset) ?: return emptyList()
        val elementStartOffset = element.startOffset
        var block: PsiElement? = PsiTreeUtil.getParentOfType(element, PyStatementList::class.java)
        while (block != null) {
            localImports.addAll(
                block.children.filter {
                    (it is PyFromImportStatement || it is PyImportStatement) && it.startOffset < elementStartOffset
                }
            )
            block = PsiTreeUtil.getParentOfType(block, PyStatementList::class.java)
        }
        return localImports
    }

    override fun addImport(psiFile: PsiFile, editor: Editor, newImport: PsiElement): Boolean {
        if (newImport !is PyImportStatementBase) return false
        if (newImport is PyFromImportStatement && newImport.isStarImport) {
            val from = newImport.importSourceQName.toString()
            AddImportHelper.addOrUpdateFromImportStatement(psiFile, from, "*", null, null, null)
            return true
        }
        newImport.importElements.forEach {
            val path = it.importedQName.toString()
            val asName = it.asName

            if (!PyCodeInsightSettings.getInstance().PREFER_FROM_IMPORT || newImport !is PyFromImportStatement) {
                AddImportHelper.addImportStatement(psiFile, path, asName, null, null)
            } else {
                val from = newImport.importSourceQName.toString()
                AddImportHelper.addOrUpdateFromImportStatement(psiFile, from, path, asName, null, null)
            }
        }
        return true
    }
}
