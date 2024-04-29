// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage

// Register Editor Actions in the Editor Context Menu
class ActionRegistrar {

    private val _messages by lazy { MutableSharedFlow<AmazonQMessage>(extraBufferCapacity = 10) }
    val flow = _messages.asSharedFlow()

    fun reportMessageClick(command: EditorContextCommand) {
        _messages.tryEmit(ContextMenuActionMessage(command))
    }

    fun reportMessageClick(command: EditorContextCommand, issue: MutableMap<String, String>) {
        _messages.tryEmit(CodeScanIssueActionMessage(command, issue))
    }

    // provide singleton access
    companion object {
        val instance = ActionRegistrar()
    }
}
