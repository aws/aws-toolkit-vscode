// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0package software.aws.toolkits.jetbrains.services.s3.BucketActions
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import icons.AwsIcons
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.components.telemetry.AnActionWrapper
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.resources.message

class CreateBucketAction : AnActionWrapper(message("s3.create.bucket.title"), null, AwsIcons.Resources.S3_BUCKET) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()
        val dialog = CreateS3BucketDialog(project, client, null)
        dialog.show()
    }
}
