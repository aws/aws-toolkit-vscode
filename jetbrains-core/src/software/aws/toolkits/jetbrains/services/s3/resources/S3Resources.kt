// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.resources

import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.S3Exception
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object S3Resources {
    val LIST_BUCKETS: Resource.Cached<List<Bucket>> = ClientBackedCachedResource(S3Client::class, "s3.list_buckets") {
        listBuckets().buckets().toList()
    }

    fun bucketRegion(bucketName: String) = ClientBackedCachedResource(S3Client::class, "s3.head_bucket.$bucketName") {
        try {
            headBucket { it.bucket(bucketName) }
                .sdkHttpResponse()
                .headers()["x-amz-bucket-region"]?.first()
                ?: throw IllegalStateException("Failed to get bucket header")
        } catch (e: S3Exception) {
            e.awsErrorDetails().sdkHttpResponse().firstMatchingHeader("x-amz-bucket-region").orElseGet { null }
                ?: throw e
        }
    }
}
