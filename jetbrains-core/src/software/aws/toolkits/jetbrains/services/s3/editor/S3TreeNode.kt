// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileTypes.FileTypeRegistry
import com.intellij.openapi.util.io.FileUtilRt
import com.intellij.ui.treeStructure.SimpleNode
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.services.s3.NOT_VERSIONED_VERSION_ID
import software.aws.toolkits.resources.message
import java.time.Instant

sealed class S3TreeNode(val bucket: S3VirtualBucket, val parent: S3LazyLoadParentNode<*>?, val key: String) : SimpleNode() {
    override fun getChildren(): Array<S3TreeNode> = arrayOf()

    @Deprecated("Do not use, exists due to SimpleNode. Use more use case specific methods", ReplaceWith("displayName()"))
    final override fun getName(): String = displayName()

    /**
     * String representation of this node in UIs
     */
    open fun displayName(): String = key.trimEnd('/').substringAfterLast('/')

    /**
     * Directory path to this node
     */
    open fun directoryPath() = parent?.key ?: throw IllegalStateException("$key has no parent!")

    override fun toString(): String = "${this::class.simpleName}(key='$key')"

    override fun getEqualityObjects(): Array<Any?> = arrayOf(bucket, key)
}

abstract class S3LazyLoadParentNode<T>(bucket: S3VirtualBucket, parent: S3LazyLoadParentNode<*>?, key: String) : S3TreeNode(bucket, parent, key) {
    private val childrenLock = Object()
    private val loadedPages = mutableSetOf<T>()
    private var cachedList: List<S3TreeNode> = listOf()

    override fun getChildren(): Array<S3TreeNode> {
        synchronized(childrenLock) {
            if (cachedList.isEmpty()) {
                cachedList = loadObjects()
            }
            return cachedList.toTypedArray()
        }
    }

    fun removeAllChildren() {
        synchronized(childrenLock) {
            cachedList = listOf()
            loadedPages.clear()
        }
    }

    fun loadMore(continuationMarker: T) {
        synchronized(childrenLock) {
            // dedupe calls
            if (loadedPages.contains(continuationMarker)) {
                return
            }

            loadedPages.add(continuationMarker)
            cachedList = children.dropLastWhile { it is S3TreeContinuationNode<*> } + loadObjects(continuationMarker)
        }
    }

    protected abstract fun loadObjects(continuationMarker: T? = null): List<S3TreeNode>
}

class S3TreeDirectoryNode(bucket: S3VirtualBucket, parent: S3TreeDirectoryNode?, key: String) : S3LazyLoadParentNode<String>(bucket, parent, key) {
    init {
        icon = AllIcons.Nodes.Folder
    }

    override fun directoryPath(): String = key

    override fun loadObjects(continuationMarker: String?): List<S3TreeNode> {
        val response = runBlocking {
            bucket.listObjects(key, continuationMarker)
        }

        val continuation = listOfNotNull(
            response.nextContinuationToken()?.let {
                S3TreeContinuationNode(bucket, this, this.key, it)
            }
        )

        val folders = response.commonPrefixes()?.map { S3TreeDirectoryNode(bucket, this, it.prefix()) } ?: emptyList()

        val s3Objects = response
            .contents()
            ?.filterNotNull()
            ?.filterNot { it.key() == key }
            ?.map { S3TreeObjectNode(this, it.key(), it.size(), it.lastModified()) as S3TreeNode }
            ?: emptyList()

        return (folders + s3Objects).sortedBy { it.key } + continuation
    }
}

interface S3Object {
    val bucket: S3VirtualBucket
    val key: String
    val versionId: String?

    val size: Long
    val lastModified: Instant

    fun fileName(): String
}

data class VersionContinuationToken(val keyMarker: String, val versionId: String)

class S3TreeObjectNode(parent: S3TreeDirectoryNode, key: String, override val size: Long, override val lastModified: Instant) :
    S3LazyLoadParentNode<VersionContinuationToken>(parent.bucket, parent, key), S3Object {
    var showHistory: Boolean = false

    init {
        icon = FileTypeRegistry.getInstance().getFileTypeByFileName(key.substringAfterLast("/")).icon
    }

    override val versionId: String? = null

    /**
     * The name of this object if saved to a file
     */
    override fun fileName() = key.substringAfterLast("/")

    override fun loadObjects(continuationMarker: VersionContinuationToken?): List<S3TreeNode> {
        if (showHistory) {
            val response = runBlocking {
                bucket.listObjectVersions(key, continuationMarker?.keyMarker, continuationMarker?.versionId)
            }

            return mutableListOf<S3TreeNode>().apply {
                response?.versions()
                    ?.filter { it.key() == key && it.versionId() != NOT_VERSIONED_VERSION_ID }
                    ?.map { S3TreeObjectVersionNode(this@S3TreeObjectNode, it.versionId(), it.size(), it.lastModified()) }
                    ?.onEach { add(it) }

                if (response?.isTruncated == true) {
                    val nextKey = response.nextKeyMarker()
                    val nextVersion = response.nextVersionIdMarker()

                    add(
                        S3TreeContinuationNode(
                            bucket,
                            this@S3TreeObjectNode,
                            this@S3TreeObjectNode.key,
                            VersionContinuationToken(nextKey, nextVersion)
                        )
                    )
                }
            }
        }

        return emptyList()
    }
}

class S3TreeObjectVersionNode(parent: S3TreeObjectNode, override val versionId: String, override val size: Long, override val lastModified: Instant) :
    S3TreeNode(parent.bucket, parent, parent.key), S3Object {

    init {
        icon = parent.icon
    }

    override fun directoryPath(): String = (parent as S3TreeObjectNode).directoryPath()

    override fun fileName(): String {
        val parentObjectName = (parent as S3TreeObjectNode).fileName()

        val filenamePrefix = FileUtilRt.getNameWithoutExtension(parentObjectName) + "@" + versionId
        val extension = FileUtilRt.getExtension(parentObjectName)
        return if (extension.isNotEmpty()) {
            "$filenamePrefix.$extension"
        } else {
            filenamePrefix
        }
    }

    override fun displayName(): String = versionId

    override fun getChildren(): Array<S3TreeNode> = emptyArray()

    override fun getEqualityObjects(): Array<Any?> = arrayOf(bucket, key, versionId)

    override fun toString(): String = "S3TreeObjectVersionNode(key='$key', versionId='$versionId')"
}

class S3TreeContinuationNode<T>(
    bucket: S3VirtualBucket,
    private val parentNode: S3LazyLoadParentNode<T>,
    key: String,
    private val continuationMarker: T
) : S3TreeNode(bucket, parentNode, key) {
    init {
        icon = AllIcons.Nodes.EmptyNode
    }

    override fun displayName(): String = message("s3.load_more")

    fun loadMore() {
        parentNode.loadMore(continuationMarker)
    }

    override fun getEqualityObjects(): Array<Any?> = arrayOf(bucket, key, continuationMarker)
}
