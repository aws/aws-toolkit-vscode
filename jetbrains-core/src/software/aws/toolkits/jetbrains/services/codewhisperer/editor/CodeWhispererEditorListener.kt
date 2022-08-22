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
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererLanguageManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererInvocationStatus
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererCodeCoverageTracker

class CodeWhispererEditorListener : EditorFactoryListener {
    override fun editorCreated(event: EditorFactoryEvent) {
        val editor = (event.editor as? EditorImpl) ?: return
        editor.project?.let { project ->
            PsiDocumentManager.getInstance(project).getPsiFile(editor.document)?.codeWhispererLanguage ?. let { language ->
                // If language is not supported by CodeWhisperer, no action needed
                if (!CodeWhispererLanguageManager.getInstance().isLanguageSupported(language.toString())) return
                // If language is supported, install document listener for CodeWhisperer service
                editor.document.addDocumentListener(
                    object : DocumentListener {
                        override fun documentChanged(event: DocumentEvent) {
                            if (!CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()) return
                            CodeWhispererInvocationStatus.getInstance().documentChanged()
                            CodeWhispererCodeCoverageTracker.getInstance(language).apply {
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
