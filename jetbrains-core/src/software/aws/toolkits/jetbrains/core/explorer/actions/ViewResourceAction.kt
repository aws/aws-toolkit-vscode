// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.ViewResourceDialog
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode

abstract class ViewResourceAction<in T : AwsExplorerNode<*>>(private val actionTitle: String, val resourceType: String) :
    SingleExplorerNodeAction<T>(actionTitle), DumbAware {

    override fun actionPerformed(selected: T, e: AnActionEvent) {
        val getResourceNameDialog = ViewResourceDialog(selected.nodeProject, resourceType, actionTitle, this::checkResourceNameValidity)
        if (getResourceNameDialog.showAndGet()) {
            viewResource(getResourceNameDialog.resourceName, selected)
        }
    }

    abstract fun viewResource(resourceToView: String, selected: T)

    abstract fun checkResourceNameValidity(resourceName: String?): Boolean
}
