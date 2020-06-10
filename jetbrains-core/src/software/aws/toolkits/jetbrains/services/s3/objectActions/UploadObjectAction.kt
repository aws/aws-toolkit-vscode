// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class UploadObjectAction(private val project: Project, treeTable: S3TreeTable) :
    SingleS3ObjectAction(treeTable, message("s3.upload.object.action"), AllIcons.Actions.Upload) {
    override fun performAction(node: S3TreeNode) {
        val descriptor =
            FileChooserDescriptorFactory.createAllButJarContentsDescriptor().withDescription(message("s3.upload.object.action", treeTable.bucket.name))
        val chooserDialog = FileChooserFactory.getInstance().createFileChooser(descriptor, project, null)
        val filesChosen = chooserDialog.choose(project).toList()

        // If there are no files chosen, the user has cancelled upload
        if (filesChosen.isEmpty()) {
            S3Telemetry.uploadObjects(project, Result.Cancelled)
            return
        }

        treeTable.uploadAndRefresh(filesChosen, node)
    }

    override fun enabled(node: S3TreeNode): Boolean = node is S3TreeDirectoryNode
}
