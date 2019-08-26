// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

class CopyArnAction : SingleResourceNodeAction<AwsExplorerResourceNode<*>>(message("explorer.copy_arn"), icon = AllIcons.Actions.Copy) {
    override fun actionPerformed(selected: AwsExplorerResourceNode<*>, e: AnActionEvent) {
        CopyPasteManager.getInstance().setContents(StringSelection(selected.resourceArn()))
    }
}