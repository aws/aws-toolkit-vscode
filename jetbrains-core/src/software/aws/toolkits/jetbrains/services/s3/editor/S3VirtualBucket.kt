// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withContext
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.aws.toolkits.jetbrains.services.s3.download
import software.aws.toolkits.jetbrains.services.s3.upload
import java.io.InputStream
import java.io.OutputStream

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

    suspend fun listObjects(prefix: String, continuationToken: String?): ListObjectsV2Response = withContext(Dispatchers.IO) {
        client.listObjectsV2 {
            it.bucket(s3Bucket.name()).delimiter("/").prefix(prefix).maxKeys(MAX_ITEMS_TO_LOAD).continuationToken(continuationToken)
        }
    }

    suspend fun deleteObjects(keys: List<String>) {
        withContext(Dispatchers.IO) {
            val keysToDelete = keys.map { ObjectIdentifier.builder().key(it).build() }
            client.deleteObjects { it.bucket(s3Bucket.name()).delete { del -> del.objects(keysToDelete) } }
        }
    }

    suspend fun renameObject(fromKey: String, toKey: String) {
        withContext(Dispatchers.IO) {
            client.copyObject { it.copySource("${s3Bucket.name()}/$fromKey").bucket(s3Bucket.name()).key(toKey) }
            client.deleteObject { it.bucket(s3Bucket.name()).key(fromKey) }
        }
    }

    suspend fun upload(project: Project, source: InputStream, length: Long, key: String) {
        withContext(Dispatchers.IO) {
            client.upload(project, source, length, s3Bucket.name(), key).await()
        }
    }

    suspend fun download(project: Project, key: String, output: OutputStream) {
        withContext(Dispatchers.IO) {
            client.download(project, s3Bucket.name(), key, output).await()
        }
    }

    private companion object {
        const val MAX_ITEMS_TO_LOAD = 300
    }
}
