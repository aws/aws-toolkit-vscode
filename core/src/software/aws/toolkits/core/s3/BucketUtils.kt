// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.amazon.awssdk.services.s3.model.S3Exception

fun S3Client.deleteBucketAndContents(bucket: String) {
    this.listObjectVersionsPaginator(ListObjectVersionsRequest.builder().bucket(bucket).build()).forEach { resp ->
        val versions = resp.versions().map {
            ObjectIdentifier.builder()
                .key(it.key())
                .versionId(it.versionId()).build()
        }
        if (versions.isEmpty()) {
            return@forEach
        }
        this.deleteObjects { it.bucket(bucket).delete { it.objects(versions) } }
    }

    this.deleteBucket { it.bucket(bucket) }
}

fun S3Client.regionForBucket(bucketName: String): String? = try {
    this.headBucket { it.bucket(bucketName) }
        .sdkHttpResponse()
        .headers()[BUCKET_REGION_HEADER]?.first() ?: throw IllegalStateException("Failed to get bucket header")
} catch (e: S3Exception) {
    e.awsErrorDetails().sdkHttpResponse().firstMatchingHeader(BUCKET_REGION_HEADER).orElseGet { null } ?: throw e
}

private const val BUCKET_REGION_HEADER = "x-amz-bucket-region"
