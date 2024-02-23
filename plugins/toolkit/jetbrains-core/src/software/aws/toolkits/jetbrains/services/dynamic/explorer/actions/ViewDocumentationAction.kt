// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.actionSystem.AnActionEvent
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSupportedTypes
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.resources.message

class ViewDocumentationAction : SingleExplorerNodeAction<DynamicResourceResourceTypeNode>(message("dynamic_resources.type.explorer.view_documentation")) {
    private val supportedType = DynamicResourceSupportedTypes.getInstance()
    override fun actionPerformed(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        supportedType.getDocs(selected.resourceType)?.let { docUrl ->
            BrowserLauncher.instance.browse(docUrl, project = e.project)
        }
    }

    override fun update(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = supportedType.getDocs(selected.resourceType) != null
    }
}
