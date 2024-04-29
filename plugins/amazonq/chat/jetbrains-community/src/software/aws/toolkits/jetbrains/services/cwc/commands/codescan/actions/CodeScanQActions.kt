// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands.codescan.actions

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.cwc.commands.ActionRegistrar
import software.aws.toolkits.jetbrains.services.cwc.commands.EditorContextCommand

open class CodeScanQActions(private val command: EditorContextCommand) : AnAction(), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val issueDataKey = DataKey.create<MutableMap<String, String>>("amazonq.codescan.explainissue")
        val issueContext = e.getData(issueDataKey) ?: return

        ActionManager.getInstance().getAction("q.openchat").actionPerformed(e)

        ActionRegistrar.instance.reportMessageClick(command, issueContext)
    }
}
