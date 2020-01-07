// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.resources.message

class UploadObjectAction(
    private val treeTable: S3TreeTable
) : DumbAwareAction(message("s3.upload.object.action"), null, AllIcons.Actions.Upload) {
    private val bucket = treeTable.bucket

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)

        val node = treeTable.getSelectedNodes().firstOrNull() ?: treeTable.getRootNode()
        val descriptor =
            FileChooserDescriptorFactory.createAllButJarContentsDescriptor().withDescription(message("s3.upload.object.action", bucket.name))
        val chooserDialog = FileChooserFactory.getInstance().createFileChooser(descriptor, project, null)
        val filesChosen = chooserDialog.choose(project, null).toList()

        treeTable.uploadAndRefresh(filesChosen, node)
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = (treeTable.isEmpty || treeTable.selectedRows.size <= 1) && !treeTable.getSelectedNodes().any { it is S3TreeContinuationNode }
    }
}
