// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.UpdateInBackground
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.explorer.ExplorerTreeToolWindowDataKeys
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.PinnedConnectionNode
import software.aws.toolkits.resources.message

class UnpinConnectionAction : AnAction(), DumbAware, UpdateInBackground {
    override fun update(e: AnActionEvent) {
        val project = e.project
        val feature = feature(e)

        e.presentation.isEnabledAndVisible = project != null && feature != null && ConnectionPinningManager.getInstance().isFeaturePinned(feature)

        feature?.featureName?.let { e.presentation.text = message("connection.pinning.unlink", it) }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val feature = feature(e) ?: return
        ConnectionPinningManager.getInstance().setPinnedConnection(feature, null)

        e.getData(ExplorerTreeToolWindowDataKeys.REFRESH_CALLBACK)?.invoke()
    }

    private fun feature(e: AnActionEvent): FeatureWithPinnedConnection? {
        val nodes = e.getData(ExplorerTreeToolWindowDataKeys.SELECTED_NODES)
        if (nodes == null || nodes.size != 1) {
            return null
        }

        val node = nodes.firstOrNull() as? PinnedConnectionNode ?: return null
        return node.feature()
    }
}
