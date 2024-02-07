// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage

interface InboundAppMessagesHandler {
    suspend fun processPromptChatMessage(message: IncomingFeatureDevMessage.ChatPrompt)
    suspend fun processNewTabCreatedMessage(message: IncomingFeatureDevMessage.NewTabCreated)
    suspend fun processTabRemovedMessage(message: IncomingFeatureDevMessage.TabRemoved)
    suspend fun processAuthFollowUpClick(message: IncomingFeatureDevMessage.AuthFollowUpWasClicked)
}
