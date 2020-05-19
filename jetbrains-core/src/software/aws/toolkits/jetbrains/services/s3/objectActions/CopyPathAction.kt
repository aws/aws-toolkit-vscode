// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.awt.datatransfer.StringSelection

class CopyPathAction(private val project: Project, treeTable: S3TreeTable) : SingleS3ObjectAction(treeTable, message("s3.copy.path"), AllIcons.Actions.Copy) {
    // Only enable it if we have some selection. We hide the root node so it means we have no selection if that is the node passed in
    override fun enabled(node: S3TreeNode): Boolean = node != treeTable.rootNode

    override fun performAction(node: S3TreeNode) {
        CopyPasteManager.getInstance().setContents(StringSelection(node.key))
        S3Telemetry.copyPath(project)
    }
}
