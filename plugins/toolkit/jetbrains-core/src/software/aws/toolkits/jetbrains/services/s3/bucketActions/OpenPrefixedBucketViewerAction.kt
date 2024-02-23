// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.s3.openEditor
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class OpenPrefixedBucketViewerAction : SingleResourceNodeAction<S3BucketNode>(), DumbAware {
    override fun actionPerformed(selected: S3BucketNode, e: AnActionEvent) {
        val prefix = Messages.showInputDialog(
            selected.nodeProject,
            message("s3.open.viewer.prefix.message"),
            message("s3.open.viewer.prefix.title"),
            null
        )

        if (prefix == null) {
            // cancelled
            S3Telemetry.openEditor(selected.nodeProject, Result.Cancelled)
            return
        }

        openEditor(selected.nodeProject, selected.bucket.name(), prefix)
    }
}
