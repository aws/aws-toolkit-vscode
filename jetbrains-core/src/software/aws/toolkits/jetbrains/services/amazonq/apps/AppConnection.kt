// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.apps

import software.aws.toolkits.jetbrains.services.amazonq.commands.MessageTypeRegistry
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessageConnector

data class AppConnection(
    val app: AmazonQApp,
    val messagesFromAppToUi: MessageConnector,
    val messagesFromUiToApp: MessageConnector,
    val messageTypeRegistry: MessageTypeRegistry,
)
