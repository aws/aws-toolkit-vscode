// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket

class S3VirtualBucket(val s3Bucket: Bucket, val client: S3Client) : LightVirtualFile() {
    override fun getName(): String = s3Bucket.name()
    override fun isWritable(): Boolean = false
    override fun getPath(): String = s3Bucket.name()
    override fun isValid(): Boolean = true
    override fun getParent(): VirtualFile? = null
    override fun toString(): String = s3Bucket.name()
    override fun isDirectory(): Boolean = true

    override fun equals(other: Any?): Boolean {
        if (other !is S3VirtualBucket) {
            return false
        }
        return s3Bucket.name() == (other as? S3VirtualBucket)?.s3Bucket?.name()
    }

    override fun hashCode(): Int = s3Bucket.name().hashCode()

    suspend fun newFolder(name: String) {
        withContext(Dispatchers.IO) {
            client.putObject({ it.bucket(s3Bucket.name()).key(name.trimEnd('/') + "/") }, RequestBody.empty())
        }
    }
}
