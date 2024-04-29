// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc

import software.aws.toolkits.jetbrains.services.amazonq.onboarding.OnboardingPageInteraction
import software.aws.toolkits.jetbrains.services.cwc.commands.CodeScanIssueActionMessage
import software.aws.toolkits.jetbrains.services.cwc.commands.ContextMenuActionMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.IncomingCwcMessage

/*
(TODO): Messages to listen to (from vscode)
    processTriggerTabIDReceived
 */
interface InboundAppMessagesHandler {
    suspend fun processPromptChatMessage(message: IncomingCwcMessage.ChatPrompt)
    suspend fun processTabWasRemoved(message: IncomingCwcMessage.TabRemoved)
    suspend fun processTabChanged(message: IncomingCwcMessage.TabChanged)
    suspend fun processFollowUpClick(message: IncomingCwcMessage.FollowupClicked)
    suspend fun processCodeWasCopiedToClipboard(message: IncomingCwcMessage.CopyCodeToClipboard)
    suspend fun processInsertCodeAtCursorPosition(message: IncomingCwcMessage.InsertCodeAtCursorPosition)
    suspend fun processStopResponseMessage(message: IncomingCwcMessage.StopResponse)
    suspend fun processChatItemVoted(message: IncomingCwcMessage.ChatItemVoted)
    suspend fun processChatItemFeedback(message: IncomingCwcMessage.ChatItemFeedback)
    suspend fun processUIFocus(message: IncomingCwcMessage.UIFocus)
    suspend fun processAuthFollowUpClick(message: IncomingCwcMessage.AuthFollowUpWasClicked)
    suspend fun processOnboardingPageInteraction(message: OnboardingPageInteraction)

    // JB specific (not in vscode)
    suspend fun processClearQuickAction(message: IncomingCwcMessage.ClearChat)
    suspend fun processHelpQuickAction(message: IncomingCwcMessage.Help)
    suspend fun processContextMenuCommand(message: ContextMenuActionMessage)
    suspend fun processCodeScanIssueAction(message: CodeScanIssueActionMessage)

    suspend fun processLinkClick(message: IncomingCwcMessage.ClickedLink)
}
