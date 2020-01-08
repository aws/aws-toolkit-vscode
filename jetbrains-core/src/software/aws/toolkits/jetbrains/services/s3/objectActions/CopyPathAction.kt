// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

class CopyPathAction(private val project: Project, treeTable: S3TreeTable) : SingleS3ObjectAction(treeTable, message("s3.copy.path"), AllIcons.Actions.Copy) {

    override fun performAction(node: S3TreeNode) {
        CopyPasteManager.getInstance().setContents(StringSelection(node.key))
        TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Succeeded)
    }

    companion object {
        private const val TELEMETRY_NAME = "s3_copypath"
    }
}
