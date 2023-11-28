// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.file.util

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile

class LanguageExtractor {
    fun extractLanguageNameFromCurrentFile(editor: Editor, project: Project): String? =
        runReadAction {
            val doc: Document = editor.document
            val psiFile: PsiFile? = PsiDocumentManager.getInstance(project).getPsiFile(doc)
            psiFile?.fileType?.name?.lowercase()
        }
}
