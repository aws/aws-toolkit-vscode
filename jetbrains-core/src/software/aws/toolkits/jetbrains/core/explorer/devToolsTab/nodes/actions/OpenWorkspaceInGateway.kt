// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.actions

import com.intellij.ide.ui.ProductIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

class OpenWorkspaceInGateway : DumbAwareAction(ProductIcons.getInstance().productIcon) {
    override fun actionPerformed(e: AnActionEvent) {
        ActionManager.getInstance().getAction("OpenRemoteDevelopment").actionPerformed(e)
    }
}
