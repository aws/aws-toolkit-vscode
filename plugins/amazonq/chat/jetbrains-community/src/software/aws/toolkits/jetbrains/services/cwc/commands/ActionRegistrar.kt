// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands

import com.intellij.openapi.project.Project
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage

// Register Editor Actions in the Editor Context Menu
class ActionRegistrar {

    private val _messages by lazy { MutableSharedFlow<AmazonQMessage>(extraBufferCapacity = 10) }
    val flow = _messages.asSharedFlow()

    fun reportMessageClick(command: EditorContextCommand, project: Project) {
        _messages.tryEmit(ContextMenuActionMessage(command, project))
    }

    fun reportMessageClick(command: EditorContextCommand, issue: MutableMap<String, String>, project: Project) {
        _messages.tryEmit(CodeScanIssueActionMessage(command, issue, project))
    }

    // provide singleton access
    companion object {
        val instance = ActionRegistrar()
    }
}
