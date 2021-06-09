// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.settings.DynamicResourcesConfigurable
import software.aws.toolkits.jetbrains.settings.DynamicResourcesSettings
import software.aws.toolkits.resources.message

class DynamicResourceSelectorNode(nodeProject: Project) : AwsExplorerNode<Unit>(nodeProject, Unit, null) {
    override fun displayName() = message("explorer.node.other.add_remove", DynamicResourcesSettings.getInstance().resourcesAvailable())

    override fun getChildren(): List<AwsExplorerNode<*>> = emptyList()

    override fun onDoubleClick() {
        ShowSettingsUtil.getInstance().showSettingsDialog(nodeProject, DynamicResourcesConfigurable::class.java)
    }
}
