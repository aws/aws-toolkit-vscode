// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.ide.CopyPasteManager
import software.aws.toolkits.jetbrains.core.utils.getRequiredData
import software.aws.toolkits.jetbrains.services.s3.NOT_VERSIONED_VERSION_ID
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.awt.datatransfer.StringSelection

class CopyUrlAction : SingleS3ObjectAction(message("s3.copy.url")) {
    override fun performAction(dataContext: DataContext, node: S3TreeNode) {
        val project = dataContext.getRequiredData(CommonDataKeys.PROJECT)
        try {
            val versionId = (node as? S3TreeObjectVersionNode)?.versionId?.takeIf { it != NOT_VERSIONED_VERSION_ID }
            val url = node.bucket.generateUrl(node.key, versionId).toString()
            CopyPasteManager.getInstance().setContents(StringSelection(url))

            S3Telemetry.copyUrl(project, presigned = false, success = true)
        } catch (e: Exception) {
            e.notifyError(project = project, title = message("s3.copy.url.failed"))
            S3Telemetry.copyUrl(project, presigned = false, success = false)
        }
    }
}
