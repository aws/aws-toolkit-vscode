// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest
import software.amazon.awssdk.services.s3.model.ObjectIdentifier

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
        this.deleteObjects { it.bucket(bucket).delete { obj -> obj.objects(versions) } }
    }

    this.deleteBucket { it.bucket(bucket) }
}

fun S3Client.regionForBucket(bucketName: String): String = this.getBucketLocation {
    it.bucket(bucketName)
}.locationConstraintAsString()
    .takeIf { it.isNotEmpty() } // getBucketLocation returns an explicit empty string location contraint for us-east-1
    ?: Region.US_EAST_1.id()
