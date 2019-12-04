// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import software.amazon.awssdk.services.s3.S3Client
import java.time.Instant

/**
 * S3 Key class represents a base class for S3 Directory and S3 Objects
 */
sealed class S3Key(val bucket: String, val key: String) {
    val name: String = if (key.endsWith("/")) key.dropLast(1) else key.substringAfterLast("/")
}

class S3Bucket(bucket: String, val client: S3Client, val creationDate: Instant) : S3Directory(bucket, "", client)

class S3Object(bucket: String, key: String, val eTag: String, val size: Long, val lastModified: Instant, val client: S3Client) :
    S3Key(bucket, key)

open class S3Directory(bucket: String, key: String, private val client: S3Client) : S3Key(bucket, key) {

    fun children(): List<S3Key> {
        val response = client.listObjectsV2 { it.bucket(bucket).delimiter("/").prefix(key) }

        val folders = response.commonPrefixes()?.map { S3Directory(bucket, it.prefix(), client) } ?: emptyList()

        val s3Objects = response.contents()?.filterNotNull()?.filterNot { it.key() == key }
            ?.map { S3Object(bucket, it.key(), it.eTag(), it.size(), it.lastModified(), client) } ?: emptyList()

        return folders + s3Objects
    }
}
