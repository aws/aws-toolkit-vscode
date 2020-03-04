// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.bucketActions

import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry

class DeleteBucketAction : DeleteResourceAction<S3BucketNode>(message("s3.delete.bucket.action"), TaggingResourceType.S3_BUCKET) {
    override fun performDelete(selected: S3BucketNode) {
        try {
            val client: S3Client = AwsClientManager.getInstance(selected.nodeProject).getClient()
            client.deleteBucketAndContents(selected.toString())
            selected.nodeProject.refreshAwsTree(S3Resources.LIST_BUCKETS)
            S3Telemetry.deleteBucket(selected.nodeProject, success = true)
        } catch (e: Exception) {
            notifyError(message("s3.delete.bucket_failed", selected.bucket.name()))
            S3Telemetry.deleteBucket(selected.nodeProject, success = false)
        }
    }
}
