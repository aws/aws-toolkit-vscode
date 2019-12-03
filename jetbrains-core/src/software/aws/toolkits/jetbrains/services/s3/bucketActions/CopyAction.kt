// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

abstract class CopyAction<in T : AwsExplorerResourceNode<*>>(text: String) :
    SingleResourceNodeAction<T>(text, icon = AllIcons.Actions.Copy),
    DumbAware {
    abstract fun performCopy(selected: T): String

    override fun actionPerformed(selected: T, e: AnActionEvent) {
        try {
            val copyContent = performCopy(selected)
            val copyPasteManager = CopyPasteManager.getInstance()
            copyPasteManager.setContents(StringSelection(copyContent))
        } catch (e: Exception) {
            e.notifyError(message("s3.copy.bucket.failed"))
        }
    }
}
