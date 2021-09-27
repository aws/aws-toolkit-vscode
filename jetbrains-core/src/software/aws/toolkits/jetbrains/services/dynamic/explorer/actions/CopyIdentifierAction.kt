// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceNode
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DynamicresourceTelemetry
import java.awt.datatransfer.StringSelection

class CopyIdentifierAction :
    SingleExplorerNodeAction<DynamicResourceNode>(message("explorer.copy_identifier"), icon = AllIcons.Actions.Copy),
    DumbAware {
    override fun actionPerformed(selected: DynamicResourceNode, e: AnActionEvent) {
        CopyPasteManager.getInstance().setContents(StringSelection(selected.resource.identifier))
        DynamicresourceTelemetry.copyIdentifier(selected.nodeProject, resourceType = selected.resource.type.fullName)
    }
}
