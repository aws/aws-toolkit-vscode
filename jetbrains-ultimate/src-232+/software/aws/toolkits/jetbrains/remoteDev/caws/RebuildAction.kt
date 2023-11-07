// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent

class RebuildAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val a = ActionManager.getInstance().getAction("aws.caws.updateDevfile")
        a.actionPerformed(e)
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = DevfileWatcher.getInstance().hasDevfileChanged()
    }

    override fun displayTextInToolbar() = true
}
