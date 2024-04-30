// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.CodeReferenceGenerated
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference

object ReferenceLogController {
    fun addReferenceLog(originalCode: String, codeReferences: List<CodeReference>?, editor: Editor, project: Project) {
        codeReferences?.let { references ->
            val cwReferences = references.map { reference ->
                Reference.builder()
                    .licenseName(reference.licenseName)
                    .repository(reference.repository)
                    .url(reference.url)
                    .recommendationContentSpan(
                        reference.recommendationContentSpan?.let { span ->
                            Span.builder()
                                .start(span.start)
                                .end(span.end)
                                .build()
                        }
                    )
                    .build()
            }
            val manager = CodeWhispererCodeReferenceManager.getInstance(project)

            manager.insertCodeReference(
                originalCode,
                cwReferences,
                editor,
                CodeWhispererEditorUtil.getCaretPosition(editor),
                null,
            )
        }
    }

    fun addReferenceLog(codeReferences: List<CodeReferenceGenerated>?, project: Project) {
        val manager = CodeWhispererCodeReferenceManager.getInstance(project)

        codeReferences?.forEach { reference ->
            val cwReferences = Reference.builder()
                .licenseName(reference.licenseName)
                .repository(reference.repository)
                .url(reference.url)
                .recommendationContentSpan(
                    reference.recommendationContentSpan?.let { span ->
                        Span.builder()
                            .start(span.start)
                            .end(span.end)
                            .build()
                    }
                )
                .build()

            manager.addReferenceLogPanelEntry(reference = cwReferences, null, null, null)
        }
    }
}
