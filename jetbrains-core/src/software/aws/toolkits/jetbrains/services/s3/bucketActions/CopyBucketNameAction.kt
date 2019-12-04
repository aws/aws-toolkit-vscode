// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketActions

import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.resources.message

class CopyBucketNameAction : CopyAction<S3BucketNode>(message("s3.copy.bucket.action")) {

    override fun performCopy(selected: S3BucketNode) = selected.toString()
}
