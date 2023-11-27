// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands

import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage

/**
 * Event emitted for context menu editor actions
 */
data class ContextMenuActionMessage(val command: EditorContextCommand) : AmazonQMessage
