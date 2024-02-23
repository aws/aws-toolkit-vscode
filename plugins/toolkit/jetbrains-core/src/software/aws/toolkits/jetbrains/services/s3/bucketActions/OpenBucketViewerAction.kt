// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.s3.openEditor

class OpenBucketViewerAction : SingleResourceNodeAction<S3BucketNode>(), DumbAware {
    override fun actionPerformed(selected: S3BucketNode, e: AnActionEvent) {
        openEditor(selected.nodeProject, selected.bucket.name())
    }
}
