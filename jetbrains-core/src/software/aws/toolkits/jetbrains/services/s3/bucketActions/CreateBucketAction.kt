// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.project.DumbAwareAction
import icons.AwsIcons
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.resources.message

class CreateBucketAction : DumbAwareAction(message("s3.create.bucket.title"), null, AwsIcons.Resources.S3_BUCKET) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()
        val dialog = CreateS3BucketDialog(project, client)
        dialog.show()
    }
}
