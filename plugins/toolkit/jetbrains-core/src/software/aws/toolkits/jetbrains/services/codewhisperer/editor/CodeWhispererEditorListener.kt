// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.psi.PsiDocumentManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker

class CodeWhispererEditorListener : EditorFactoryListener {
    override fun editorCreated(event: EditorFactoryEvent) {
        val editor = (event.editor as? EditorImpl) ?: return
        editor.project?.let { project ->
            PsiDocumentManager.getInstance(project).getPsiFile(editor.document)?.programmingLanguage() ?. let { language ->
                // If language is not supported by CodeWhisperer, no action needed
                if (!language.isCodeCompletionSupported()) return
                // If language is supported, install document listener for CodeWhisperer service
                editor.document.addDocumentListener(
                    object : BulkAwareDocumentListener {
                        // TODO: Track only deletion changes within the current 5-min interval which will give
                        // the most accurate code percentage data.
                        override fun documentChanged(event: DocumentEvent) {
                            if (!isCodeWhispererEnabled(project)) return
                            CodeWhispererInvocationStatus.getInstance().documentChanged()
                            CodeWhispererCodeCoverageTracker.getInstance(project, language).apply {
                                activateTrackerIfNotActive()
                                documentChanged(event)
                            }
                        }
                    },
                    editor.disposable
                )
            }
        }
    }
}
