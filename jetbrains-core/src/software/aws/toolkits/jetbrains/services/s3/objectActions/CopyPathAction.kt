// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.ide.CopyPasteManager
import software.aws.toolkits.jetbrains.core.utils.getRequiredData
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.awt.datatransfer.StringSelection

class CopyPathAction : SingleS3ObjectAction(message("s3.copy.path")) {
    override fun performAction(dataContext: DataContext, node: S3TreeNode) {
        CopyPasteManager.getInstance().setContents(StringSelection(node.key))
        S3Telemetry.copyPath(dataContext.getRequiredData(CommonDataKeys.PROJECT))
    }

    override fun enabled(node: S3TreeNode): Boolean = node !is S3TreeObjectVersionNode
}
