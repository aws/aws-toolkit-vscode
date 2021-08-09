// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.explorer.actions.ExplorerNodeAction
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OtherResourcesNode

class CreateResourceAction: SingleExplorerNodeAction<DynamicResourceResourceTypeNode>("Create Resource"), DumbAware {

    override fun actionPerformed(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        println("helloooo")
    }

}
