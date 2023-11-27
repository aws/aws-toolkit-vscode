// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.apps

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonq.commands.MessageTypeRegistry
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessageListener
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonq.webview.FqnWebviewAdapter

/**
 * Context object that is passed to each [AmazonQApp] during initialization. Contains the connections needed to communicate with the Amazon Q UI.
 */
data class AmazonQAppInitContext(
    val project: Project,
    val messagesFromAppToUi: MessagePublisher,
    val messagesFromUiToApp: MessageListener,
    val messageTypeRegistry: MessageTypeRegistry,
    val fqnWebviewAdapter: FqnWebviewAdapter,
)
