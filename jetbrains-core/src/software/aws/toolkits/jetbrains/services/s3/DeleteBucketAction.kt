// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.jetbrains.core.DeleteResourceAction

class DeleteBucketAction : DeleteResourceAction<S3BucketNode>() {
    override fun performDelete(selected: S3BucketNode) {
        selected.client.deleteBucketAndContents(selected.bucket.bucket)
    }
}