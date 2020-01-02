// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.bucketActions

import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerService
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class DeleteBucketAction : DeleteResourceAction<S3BucketNode>(message("s3.delete.bucket.action"), TaggingResourceType.S3_BUCKET) {

    override fun performDelete(selected: S3BucketNode) {
        try {
            val client: S3Client = AwsClientManager.getInstance(selected.nodeProject).getClient()
            client.deleteBucketAndContents(selected.toString())
            AwsExplorerService.refreshAwsTree(selected.nodeProject, S3Resources.LIST_BUCKETS)
            TelemetryService.recordSimpleTelemetry(selected.nodeProject, TELEMETRY_NAME, TelemetryResult.Succeeded)
        } catch (e: Exception) {
            notifyError(message("s3.delete.bucket_failed", selected.bucket.name()))
            TelemetryService.recordSimpleTelemetry(selected.nodeProject, TELEMETRY_NAME, TelemetryResult.Failed)
        }
    }

    companion object {
        private const val TELEMETRY_NAME = "s3_deletebucket"
    }
}
