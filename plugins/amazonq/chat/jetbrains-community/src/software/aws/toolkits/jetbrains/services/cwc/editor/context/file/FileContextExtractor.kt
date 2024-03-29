// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.file

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import software.aws.toolkits.jetbrains.services.amazonq.webview.FqnWebviewAdapter
import software.aws.toolkits.jetbrains.services.cwc.editor.context.file.util.LanguageExtractor
import software.aws.toolkits.jetbrains.services.cwc.editor.context.file.util.MatchPolicyExtractor
import software.aws.toolkits.jetbrains.utils.computeOnEdt

class FileContextExtractor(private val fqnWebviewAdapter: FqnWebviewAdapter, private val project: Project) {
    private val languageExtractor: LanguageExtractor = LanguageExtractor()
    suspend fun extract(): FileContext? {
        val editor = computeOnEdt {
            FileEditorManager.getInstance(project).selectedTextEditor
        } ?: return null

        val fileLanguage = computeOnEdt {
            languageExtractor.extractLanguageNameFromCurrentFile(editor, project)
        }
        val fileText = computeOnEdt {
            editor.document.text
        }

        val filePath = runReadAction {
            val doc: Document = editor.document
            val psiFile: PsiFile? = PsiDocumentManager.getInstance(project).getPsiFile(doc)
            psiFile?.virtualFile?.path
        }

        val matchPolicy = MatchPolicyExtractor.extractMatchPolicyFromCurrentFile(
            isCodeSelected = false,
            fileLanguage = fileLanguage,
            fileText = fileText,
            fqnWebviewAdapter,
        )

        return FileContext(
            fileLanguage = fileLanguage,
            filePath = filePath,
            matchPolicy = matchPolicy,
        )
    }
}
