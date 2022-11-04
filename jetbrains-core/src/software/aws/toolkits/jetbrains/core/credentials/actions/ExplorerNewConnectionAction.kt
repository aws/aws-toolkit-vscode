// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

class ExplorerNewConnectionAction : DumbAwareAction(AllIcons.General.Add) {
    override fun displayTextInToolbar() = true

    override fun actionPerformed(e: AnActionEvent) {
        TODO("Not yet implemented")
    }
}
