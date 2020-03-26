// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry

class DeleteBucketAction : DeleteResourceAction<S3BucketNode>(message("s3.delete.bucket.action"), TaggingResourceType.S3_BUCKET) {
    override fun performDelete(selected: S3BucketNode) {
        try {
            val client: S3Client = AwsClientManager.getInstance(selected.nodeProject).getClient()

            val fileEditorManager = FileEditorManager.getInstance(selected.nodeProject)
            fileEditorManager.openFiles.forEach {
                if (it is S3VirtualBucket && it.s3Bucket.name() == selected.displayName()) {
                    runInEdt {
                        fileEditorManager.closeFile(it)
                    }
                }
            }

            client.deleteBucketAndContents(selected.displayName())
            selected.nodeProject.refreshAwsTree(S3Resources.LIST_BUCKETS)
            S3Telemetry.deleteBucket(selected.nodeProject, success = true)
        } catch (e: Exception) {
            notifyError(message("s3.delete.bucket_failed", selected.bucket.name(), e.message ?: ""))
            S3Telemetry.deleteBucket(selected.nodeProject, success = false)
        }
    }
}
