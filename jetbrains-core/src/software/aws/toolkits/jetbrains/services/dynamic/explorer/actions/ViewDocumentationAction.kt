// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceFileActionProvider
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.resources.message

class ViewDocumentationAction : SingleExplorerNodeAction<DynamicResourceResourceTypeNode>(message("dynamic_resources.type.explorer.view_documentation")) {
    override fun actionPerformed(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        DynamicResourceFileActionProvider.openBrowser(selected.value, selected.nodeProject)
    }
}
