// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceNode
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OpenResourceModelSourceAction
import software.aws.toolkits.resources.message

class OpenReadOnlyFileAction :
    SingleExplorerNodeAction<DynamicResourceNode>(message("dynamic_resources.openReadOnlyFile_text")),
    DumbAware {
    override fun actionPerformed(selected: DynamicResourceNode, e: AnActionEvent) {
        selected.openResourceModelInEditor(OpenResourceModelSourceAction.READ)
    }
}
