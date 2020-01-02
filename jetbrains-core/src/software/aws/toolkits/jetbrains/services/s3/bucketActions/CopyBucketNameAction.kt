// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

class CopyBucketNameAction : SingleResourceNodeAction<S3BucketNode>(message("s3.copy.bucket.action"), icon = AllIcons.Actions.Copy), DumbAware {
    override fun actionPerformed(selected: S3BucketNode, e: AnActionEvent) {
        val copyPasteManager = CopyPasteManager.getInstance()
        copyPasteManager.setContents(StringSelection(selected.toString()))
        TelemetryService.recordSimpleTelemetry(selected.nodeProject, TELEMETRY_NAME, TelemetryResult.Succeeded)
    }

    companion object {
        private const val TELEMETRY_NAME = "s3_copybucketname"
    }
}
