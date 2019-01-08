// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.s3.regionForBucket

fun S3Client.listBucketsByRegion(regionId: String): Sequence<Bucket> = this.listBuckets().buckets()
    .asSequence()
    .filter { this.regionForBucket(it.name()) == regionId }
