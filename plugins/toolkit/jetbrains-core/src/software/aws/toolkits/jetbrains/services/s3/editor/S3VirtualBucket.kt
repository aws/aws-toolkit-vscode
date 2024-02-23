// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.testFramework.LightVirtualFile
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.s3.download
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.services.s3.upload
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.io.OutputStream
import java.net.URL
import java.nio.file.Path

class S3VirtualBucket(val s3Bucket: String, prefix: String, val client: S3Client, val project: Project) :
    LightVirtualFile(vfsName(s3Bucket, prefix)) {

    var prefix = prefix
        set(value) {
            val oldName = name
            field = value
            VirtualFileManager.getInstance().notifyPropertyChanged(this, PROP_NAME, oldName, name)
        }

    override fun isDirectory(): Boolean = false /* Unit tests refuse to open this in an editor if this is true */
    override fun isValid(): Boolean = true
    override fun isWritable(): Boolean = false
    override fun getName(): String = vfsName(s3Bucket, prefix)
    override fun getParent(): VirtualFile? = null
    override fun getPath(): String = super.getName()
    override fun toString(): String = super.getName()

    override fun equals(other: Any?): Boolean {
        if (other !is S3VirtualBucket) {
            return false
        }
        return s3Bucket == (other as? S3VirtualBucket)?.s3Bucket && prefix == (other as? S3VirtualBucket)?.prefix
    }

    override fun hashCode(): Int = s3Bucket.hashCode() + prefix.hashCode()

    suspend fun newFolder(name: String) {
        withContext(getCoroutineBgContext()) {
            client.putObject({ it.bucket(s3Bucket).key(name.trimEnd('/') + "/") }, RequestBody.empty())
        }
    }

    suspend fun listObjects(prefix: String, continuationToken: String?): ListObjectsV2Response =
        withContext(getCoroutineBgContext()) {
            client.listObjectsV2 {
                it.bucket(s3Bucket).delimiter("/").prefix(prefix).maxKeys(MAX_ITEMS_TO_LOAD).continuationToken(continuationToken)
            }
        }

    suspend fun listObjectVersions(key: String, keyMarker: String?, versionIdMarker: String?): ListObjectVersionsResponse? =
        withContext(getCoroutineBgContext()) {
            client.listObjectVersions {
                it.bucket(s3Bucket).prefix(key).delimiter("/").maxKeys(MAX_ITEMS_TO_LOAD).keyMarker(keyMarker).versionIdMarker(versionIdMarker)
            }
        }

    suspend fun deleteObjects(keys: List<String>) {
        withContext(getCoroutineBgContext()) {
            val keysToDelete = keys.map { ObjectIdentifier.builder().key(it).build() }
            client.deleteObjects { it.bucket(s3Bucket).delete { del -> del.objects(keysToDelete) } }
        }
    }

    suspend fun renameObject(fromKey: String, toKey: String) {
        withContext(getCoroutineBgContext()) {
            client.copyObject { it.sourceBucket(s3Bucket).sourceKey(fromKey).destinationBucket(s3Bucket).destinationKey(toKey) }
            client.deleteObject { it.bucket(s3Bucket).key(fromKey) }
        }
    }

    suspend fun upload(project: Project, source: Path, key: String) {
        withContext(getCoroutineBgContext()) {
            client.upload(project, source, s3Bucket, key).await()
        }
    }

    suspend fun download(project: Project, key: String, versionId: String? = null, output: OutputStream) {
        withContext(getCoroutineBgContext()) {
            client.download(project, s3Bucket, key, versionId, output).await()
        }
    }

    fun generateUrl(key: String, versionId: String?): URL = client.utilities().getUrl {
        it.bucket(s3Bucket)
        it.key(key)
        it.versionId(versionId)
    }

    fun handleDeletedBucket() {
        notifyError(project = project, content = message("s3.open.viewer.bucket_does_not_exist", s3Bucket))
        val fileEditorManager = FileEditorManager.getInstance(project)
        fileEditorManager.openFiles.forEach {
            if (it is S3VirtualBucket && it.name == s3Bucket) {
                runBlocking(getCoroutineUiContext()) {
                    fileEditorManager.closeFile(it)
                }
            }
        }
        project.refreshAwsTree(S3Resources.LIST_BUCKETS)
    }

    private companion object {
        const val MAX_ITEMS_TO_LOAD = 300

        fun vfsName(s3BucketName: String, subroot: String): String = if (subroot.isBlank()) {
            s3BucketName
        } else {
            "$s3BucketName/$subroot"
        }
    }
}
