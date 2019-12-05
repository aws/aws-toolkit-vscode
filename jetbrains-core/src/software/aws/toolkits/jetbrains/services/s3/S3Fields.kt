// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import software.amazon.awssdk.services.s3.S3Client
import java.time.Instant

/**
 * S3 Key class represents a base class for S3 Directory and S3 Objects
 */
sealed class S3Item(val key: String) {
    val name: String = if (key.endsWith("/")) key.dropLast(1).substringAfterLast('/') else key.substringAfterLast('/')
}

class S3Object(key: String, val size: Long, val lastModified: Instant) : S3Item(key)

class S3Directory(val bucket: String, key: String, private val client: S3Client) : S3Item(key) {
    fun children(): List<S3Item> {
        val response = client.listObjectsV2 { it.bucket(bucket).delimiter("/").prefix(key) }

        val folders = response.commonPrefixes()?.map { S3Directory(bucket, it.prefix(), client) } ?: emptyList()

        val s3Objects = response
            .contents()
            ?.filterNotNull()
            ?.filterNot { it.key() == key }
            ?.map { S3Object(it.key(), it.size(), it.lastModified()) }
            ?: emptyList()

        return folders + s3Objects
    }
}
