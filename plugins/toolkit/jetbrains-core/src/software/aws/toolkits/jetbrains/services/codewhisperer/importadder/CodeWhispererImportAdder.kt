// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import software.amazon.awssdk.services.codewhispererruntime.model.Import
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext

abstract class CodeWhispererImportAdder {
    abstract val supportedLanguages: List<CodeWhispererProgrammingLanguage>
    abstract val dummyFileName: String

    fun insertImportStatements(states: InvocationContext, sessionContext: SessionContext) {
        val imports = states.recommendationContext.details[sessionContext.selectedIndex]
            .recommendation.mostRelevantMissingImports()
        LOG.info { "Adding ${imports.size} imports for completions, sessionId: ${states.responseContext.sessionId}" }
        imports.forEach {
            insertImportStatement(states, it)
        }
    }

    private fun insertImportStatement(states: InvocationContext, import: Import) {
        val project = states.requestContext.project
        val editor = states.requestContext.editor
        val document = editor.document
        val psiFile = PsiDocumentManager.getInstance(project).getPsiFile(document) ?: return

        val statement = import.statement()
        LOG.info { "Import statement to be added: $statement" }
        val newImport = createNewImportPsiElement(psiFile, statement)
        if (newImport == null) {
            LOG.debug { "Failed to create the import element using the import string" }
            return
        }

        if (!isSupportedImportStyle(newImport)) {
            LOG.debug { "Import statement \"${newImport.text}\" is not supported" }
            return
        }

        LOG.debug { "Checking duplicates with existing imports" }
        val hasDuplicate = hasDuplicatedImports(psiFile, editor, newImport)
        if (hasDuplicate) {
            LOG.debug { "Found duplicates with existing imports, not adding the new import" }
            return
        } else {
            LOG.debug { "Found no duplicates with existing imports" }
        }

        val added = addImport(psiFile, editor, newImport)
        LOG.info { "Added import: $added" }
    }

    abstract fun createNewImportPsiElement(psiFile: PsiFile, statement: String): PsiElement?

    open fun isSupportedImportStyle(newImport: PsiElement) = true

    // Currently if the new import is 'from a import b, c', a duplicate match to any of the import element
    // will return as a valid duplicate to the whole import statement.
    open fun hasDuplicatedImports(psiFile: PsiFile, editor: Editor, newImport: PsiElement): Boolean {
        val topLevelImports = getTopLevelImports(psiFile, editor)
        LOG.debug {
            "Checking top-level imports: [${topLevelImports.map { it.text }.reduceOrNull { acc, s -> "$acc, $s" }.orEmpty()}]"
        }

        var duplicate = hasDuplicatedImportsHelper(newImport, topLevelImports)
        if (duplicate != null) {
            LOG.debug { "Found duplicates from top-level imports \"${duplicate?.text}\"" }
            return true
        } else {
            LOG.debug { "Found no duplicates from top-level imports" }
        }

        val localImports = getLocalImports(psiFile, editor)
        LOG.debug {
            "Checking local imports: [${localImports.map { it.text }.reduceOrNull { acc, s -> "$acc, $s" }.orEmpty()}]"
        }
        duplicate = hasDuplicatedImportsHelper(newImport, localImports)
        if (duplicate != null) {
            LOG.debug { "Found duplicates from local imports \"${duplicate.text}\"" }
            return true
        } else {
            LOG.debug { "Found no duplicates from local imports" }
        }

        return false
    }

    abstract fun hasDuplicatedImportsHelper(newImport: PsiElement, existingImports: List<PsiElement>): PsiElement?

    abstract fun getTopLevelImports(psiFile: PsiFile, editor: Editor): List<PsiElement>

    abstract fun getLocalImports(psiFile: PsiFile, editor: Editor): List<PsiElement>

    abstract fun addImport(psiFile: PsiFile, editor: Editor, newImport: PsiElement): Boolean

    companion object {
        private val EP = ExtensionPointName.create<CodeWhispererImportAdder>("aws.toolkit.codewhisperer.importAdder")
        internal val LOG = getLogger<CodeWhispererImportAdder>()

        fun get(language: CodeWhispererProgrammingLanguage): CodeWhispererImportAdder? =
            EP.extensionList.firstOrNull { language in it.supportedLanguages }
                ?: EP.extensionList.find { it is CodeWhispererFallbackImportAdder }
    }
}
