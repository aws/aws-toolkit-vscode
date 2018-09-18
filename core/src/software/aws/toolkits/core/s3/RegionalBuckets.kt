// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.S3Exception

fun S3Client.regionForBucket(bucketName: String): String {
    return try {
        this.headBucket { it.bucket(bucketName) }
            .sdkHttpResponse()
            .headers()[BUCKET_REGION_HEADER]?.first() ?: throw IllegalStateException("Failed to get bucket header")
    } catch (e: S3Exception) {
        e.awsErrorDetails().sdkHttpResponse().firstMatchingHeader(BUCKET_REGION_HEADER).orElseGet { null } ?: throw e
    }
}

private const val BUCKET_REGION_HEADER = "x-amz-bucket-region"