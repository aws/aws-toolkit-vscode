// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.userIntent

import software.amazon.awssdk.services.codewhispererstreaming.model.UserIntent
import software.aws.toolkits.jetbrains.services.amazonq.onboarding.OnboardingPageInteraction
import software.aws.toolkits.jetbrains.services.amazonq.onboarding.OnboardingPageInteractionType
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.FollowUpType
import software.aws.toolkits.jetbrains.services.cwc.commands.EditorContextCommand

class UserIntentRecognizer {
    fun getUserIntentFromContextMenuCommand(command: EditorContextCommand) = when (command) {
        EditorContextCommand.Explain -> UserIntent.EXPLAIN_CODE_SELECTION
        EditorContextCommand.Refactor -> UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
        EditorContextCommand.Fix -> UserIntent.APPLY_COMMON_BEST_PRACTICES
        EditorContextCommand.Optimize -> UserIntent.IMPROVE_CODE
        EditorContextCommand.ExplainCodeScanIssue -> UserIntent.EXPLAIN_CODE_SELECTION
        EditorContextCommand.SendToPrompt -> null
    }

    fun getUserIntentFromPromptChatMessage(prompt: String) = when {
        prompt.startsWith("Explain") -> UserIntent.EXPLAIN_CODE_SELECTION
        prompt.startsWith("Refactor") -> UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
        prompt.startsWith("Fix") -> UserIntent.APPLY_COMMON_BEST_PRACTICES
        prompt.startsWith("Optimize") -> UserIntent.IMPROVE_CODE
        else -> null
    }

    fun getUserIntentFromFollowupType(type: FollowUpType) = when (type) {
        FollowUpType.Alternatives -> UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
        FollowUpType.CommonPractices -> UserIntent.APPLY_COMMON_BEST_PRACTICES
        FollowUpType.Improvements -> UserIntent.IMPROVE_CODE
        FollowUpType.MoreExamples -> UserIntent.SHOW_EXAMPLES
        FollowUpType.CiteSources -> UserIntent.CITE_SOURCES
        FollowUpType.LineByLine -> UserIntent.EXPLAIN_LINE_BY_LINE
        FollowUpType.ExplainInDetail -> UserIntent.EXPLAIN_CODE_SELECTION
        FollowUpType.Generated -> null
        FollowUpType.StopCodeTransform -> null
        FollowUpType.NewCodeTransform -> null
    }

    fun getUserIntentFromOnboardingPageInteraction(interaction: OnboardingPageInteraction) = when (interaction.type) {
        OnboardingPageInteractionType.CwcButtonClick -> null
    }
}
