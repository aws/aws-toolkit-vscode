// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.psi.PsiDocumentManager
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil.codeWhispererLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker

class CodeWhispererEditorListener : EditorFactoryListener {
    override fun editorCreated(event: EditorFactoryEvent) {
        val editor = (event.editor as? EditorImpl) ?: return

        editor.document.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    CodeWhispererInvocationStatus.getInstance().documentChanged()
                    editor.project?.let { project ->
                        PsiDocumentManager.getInstance(project).getPsiFile(editor.document)?.codeWhispererLanguage ?. let { language ->
                            CodeWhispererCodeCoverageTracker.getInstance(language).apply {
                                activateTrackerIfNotActive()
                                documentChanged(event)
                            }
                        }
                    }
                }
            },
            editor.disposable
        )
    }
}
