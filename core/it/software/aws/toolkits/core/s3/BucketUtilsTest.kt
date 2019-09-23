// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.BucketVersioningStatus
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.aws.toolkits.core.rules.S3TemporaryBucketRule

class BucketUtilsTest {
    private val s3Client = S3Client.builder().region(Region.US_WEST_1).build()
    @Rule
    @JvmField
    val temporaryBucketRule = S3TemporaryBucketRule(s3Client)

    @Test
    fun deleteAnEmptyBucket() {
        createAndDeleteBucket {}
    }

    @Test
    fun deleteABucketWithObjects() {
        createAndDeleteBucket { bucket ->
            s3Client.putObject(PutObjectRequest.builder().bucket(bucket).key("hello").build(), RequestBody.fromString(""))
        }
    }

    @Test
    fun deleteABucketWithVersionedObjects() {
        createAndDeleteBucket { bucket ->
            s3Client.putBucketVersioning { it.bucket(bucket).versioningConfiguration { it.status(BucketVersioningStatus.ENABLED) } }
            s3Client.putObject(PutObjectRequest.builder().bucket(bucket).key("hello").build(), RequestBody.fromString(""))
            s3Client.putObject(PutObjectRequest.builder().bucket(bucket).key("hello").build(), RequestBody.fromString(""))
        }
    }

    private fun createAndDeleteBucket(populateBucket: (String) -> Unit) {
        val bucket = temporaryBucketRule.createBucket()
        populateBucket(bucket)
        s3Client.deleteBucketAndContents(bucket)
        assertThat(s3Client.listBuckets().buckets().map { it.name() }).doesNotContain(bucket)
    }
}
