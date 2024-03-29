// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonq.webview.FqnWebviewAdapter
import software.aws.toolkits.jetbrains.services.cwc.editor.context.file.FileContextExtractor
import software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea.FocusAreaContextExtractor

class ActiveFileContextExtractor(
    private val fileContextExtractor: FileContextExtractor,
    private val focusAreaContextExtractor: FocusAreaContextExtractor,
) {

    suspend fun extractContextForTrigger(triggerType: ExtractionTriggerType) =
        ActiveFileContext(
            extractActiveFileContext(triggerType),
            extractFocusAreaContext(triggerType),
        )

    private suspend fun extractFocusAreaContext(triggerType: ExtractionTriggerType) = when (triggerType) {
        ExtractionTriggerType.ChatMessage -> focusAreaContextExtractor.extract()
        ExtractionTriggerType.ContextMenu -> focusAreaContextExtractor.extract()
        ExtractionTriggerType.OnboardingPageInteraction -> null
    }

    private suspend fun extractActiveFileContext(triggerType: ExtractionTriggerType) = when (triggerType) {
        ExtractionTriggerType.ChatMessage -> fileContextExtractor.extract()
        ExtractionTriggerType.ContextMenu -> fileContextExtractor.extract()
        ExtractionTriggerType.OnboardingPageInteraction -> null
    }

    companion object {
        fun create(fqnWebviewAdapter: FqnWebviewAdapter, project: Project) = ActiveFileContextExtractor(
            fileContextExtractor = FileContextExtractor(fqnWebviewAdapter, project),
            focusAreaContextExtractor = FocusAreaContextExtractor(fqnWebviewAdapter, project),
        )
    }
}
