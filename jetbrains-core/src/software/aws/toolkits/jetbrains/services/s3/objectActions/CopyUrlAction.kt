// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.awt.datatransfer.StringSelection

class CopyUrlAction(private val project: Project, treeTable: S3TreeTable) : SingleS3ObjectAction(treeTable, message("s3.copy.url")) {
    override fun performAction(node: S3TreeNode) = try {
        var url = treeTable.bucket.generateUrl(node.key).toString()
        if (node is S3TreeObjectVersionNode) {
            // TODO replace with api call one available https://github.com/aws/aws-sdk-java-v2/issues/2224
            url += "?versionId=${node.versionId}"
        }
        CopyPasteManager.getInstance().setContents(StringSelection(url))

        S3Telemetry.copyUrl(project, presigned = false, success = true)
    } catch (e: Exception) {
        e.notifyError(project = project, title = message("s3.copy.url.failed"))
        S3Telemetry.copyUrl(project, presigned = false, success = false)
    }
}
