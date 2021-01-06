// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.fileTypes.FileTypeRegistry
import com.intellij.openapi.fileTypes.UnknownFileType
import com.intellij.openapi.util.io.FileUtilRt
import com.intellij.ui.treeStructure.SimpleNode
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse
import software.aws.toolkits.resources.message
import java.time.Instant

sealed class S3TreeNode(val bucketName: String, val parent: S3LazyLoadParentNode?, val key: String) : SimpleNode() {
    open val isDirectory = false
    override fun getChildren(): Array<S3TreeNode> = arrayOf()
    override fun getName(): String = key.substringAfterLast('/')
}

fun S3TreeNode.getDirectoryKey() = if (isDirectory) {
    key
} else {
    parent?.key ?: throw IllegalStateException("$key claimed it was not a directory but has no parent!")
}

abstract class S3LazyLoadParentNode(bucketName: String, parent: S3LazyLoadParentNode?, key: String) : S3TreeNode(bucketName, parent, key) {
    private val childrenLock = Object()
    private val loadedPages = mutableSetOf<String>()
    private var cachedList: List<S3TreeNode> = listOf()

    override fun getChildren(): Array<S3TreeNode> {
        synchronized(childrenLock) {
            if (cachedList.isEmpty()) {
                cachedList = loadObjects()
            }
        }
        return cachedList.toTypedArray()
    }

    fun removeAllChildren() {
        cachedList = listOf()
    }

    @Synchronized
    fun loadMore(continuationMarker: String) {
        // dedupe calls
        if (loadedPages.contains(continuationMarker)) {
            return
        }
        cachedList = children.dropLastWhile { it is S3TreeContinuationNode } + loadObjects(continuationMarker)
        loadedPages.add(continuationMarker)
    }

    protected abstract fun loadObjects(continuationMarker: String? = null): List<S3TreeNode>
}

class S3TreeDirectoryNode(private val bucket: S3VirtualBucket, parent: S3LazyLoadParentNode?, key: String) : S3LazyLoadParentNode(bucket.name, parent, key) {
    override val isDirectory = true
    override fun getName(): String = key.dropLast(1).substringAfterLast('/') + '/'

    override fun loadObjects(continuationMarker: String?): List<S3TreeNode> {
        val response = runBlocking {
            bucket.listObjects(key, continuationMarker)
        }

        val continuation = listOfNotNull(
            response.nextContinuationToken()?.let {
                S3TreeContinuationNode(bucketName, this, "${this.key}/${message("s3.load_more")}", it)
            }
        )

        val folders = response.commonPrefixes()?.map { S3TreeDirectoryNode(bucket, this, it.prefix()) } ?: emptyList()

        val s3Objects = response
            .contents()
            ?.filterNotNull()
            ?.filterNot { it.key() == key }
            ?.map { S3TreeObjectNode(bucket, this, it.key(), it.size(), it.lastModified()) as S3TreeNode }
            ?: emptyList()

        return (folders + s3Objects).sortedBy { it.key } + continuation
    }
}

private val fileTypeRegistry = FileTypeRegistry.getInstance()

open class S3TreeObjectNode(val bucket: S3VirtualBucket, parent: S3LazyLoadParentNode?, key: String, val size: Long, val lastModified: Instant) :
    S3LazyLoadParentNode(bucket.name, parent, key) {

    var showHistory: Boolean = false
    var responseIterator: Iterator<ListObjectVersionsResponse>? = null
    private val fileType = fileTypeRegistry.getFileTypeByFileName(name)

    init {
        fileType.takeIf { it !is UnknownFileType }?.icon.let { icon = it }
    }

    override fun loadObjects(continuationMarker: String?): List<S3TreeNode> {
        if (showHistory) {
            responseIterator = responseIterator ?: runBlocking {
                bucket.listObjectVersionsPaginated(key)
            }.iterator()

            val nextPage = responseIterator
                ?.next()
                ?.versions()
                ?.map { S3TreeObjectVersionNode(bucket, this, key, it.size(), it.lastModified(), it.versionId()) as S3TreeNode }
                ?: emptyList()

            if (responseIterator?.hasNext() == true) {
                return nextPage + S3TreeContinuationNode(
                    bucketName,
                    this,
                    "${this.key}/${message("s3.load_more")}",
                    (nextPage.last() as S3TreeObjectVersionNode).versionId
                )
            }
            return nextPage
        }
        return emptyList()
    }
}

class S3TreeObjectVersionNode(bucket: S3VirtualBucket, parent: S3TreeObjectNode, key: String, size: Long, lastModified: Instant, val versionId: String) :
    S3TreeObjectNode(bucket, parent, key, size, lastModified) {

    override fun getName(): String {
        // For not versioned buckets api can return versionId as literal 'null' so we avoid propagating null string to UI.
        val versionId = if (versionId != "null") versionId else (parent as S3TreeObjectNode).name
        val originalExtension = FileUtilRt.getExtension((parent as S3TreeObjectNode).name)
        val extension = if (originalExtension.isNotBlank()) ".$originalExtension" else ""

        return "$versionId$extension"
    }

    override fun getChildren(): Array<S3TreeNode> = emptyArray()
}

class S3TreeContinuationNode(bucketName: String, parent: S3LazyLoadParentNode, key: String, val continuationMarker: String) :
    S3TreeNode(bucketName, parent, key)
