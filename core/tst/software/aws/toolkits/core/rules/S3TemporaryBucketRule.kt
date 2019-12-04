// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.rules

import org.junit.rules.ExternalResource
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.core.utils.RuleUtils

class S3TemporaryBucketRule(private val s3Client: S3Client) : ExternalResource() {
    private val buckets = mutableListOf<String>()

    /**
     * Creates a temporary bucket with the optional prefix (or calling class if prefix is omitted)
     */
    fun createBucket(prefix: String = RuleUtils.prefixFromCallingClass()): String {
        val bucketName: String = RuleUtils.randomName(prefix)
        s3Client.createBucket { it.bucket(bucketName) }
        buckets.add(bucketName)
        return bucketName
    }

    override fun after() {
        val exceptions = buckets.mapNotNull { deleteBucketAndContents(it) }
        if (exceptions.isNotEmpty()) {
            throw RuntimeException("Failed to delete all buckets. \n\t- ${exceptions.map { it.message }.joinToString("\n\t- ")}")
        }
    }

    private fun deleteBucketAndContents(bucket: String): Exception? = try {
        s3Client.deleteBucketAndContents(bucket)
        null
    } catch (e: Exception) {
        when (e) {
            is NoSuchBucketException -> null
            else -> RuntimeException("Failed to delete bucket: $bucket - ${e.message}", e)
        }
    }
}
