// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileSystem
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import java.io.InputStream
import java.io.OutputStream
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * BaseS3VirtualFile is a base class to represent a virtual file
 */
abstract class BaseS3VirtualFile(val fileSystem: S3VirtualFileSystem, private val parent: VirtualFile?, open val key: S3Key) :
    VirtualFile() {

    fun formatDate(date: Instant): String {
        val datetime = LocalDateTime.ofInstant(date, ZoneId.systemDefault())
        return datetime.atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("MMM d YYYY hh:mm:ss a z"))
    }

    override fun getName(): String = key.key

    override fun isWritable(): Boolean = false

    override fun getPath(): String = "${key.bucket}/${key.key}"

    override fun isValid(): Boolean = true

    override fun getParent(): VirtualFile? = parent

    override fun toString(): String = "${key.key}"

    override fun getFileSystem(): VirtualFileSystem = fileSystem

    override fun getLength(): Long = 0

    override fun getTimeStamp(): Long = 0

    override fun contentsToByteArray(): ByteArray {
        throw UnsupportedOperationException("contentsToByteArray() cannot be called against this object type")
    }

    override fun getInputStream(): InputStream {
        throw UnsupportedOperationException("getInputStream() cannot be called against this object type")
    }

    override fun getOutputStream(requestor: Any?, newModificationStamp: Long, newTimeStamp: Long): OutputStream {
        throw UnsupportedOperationException("getOutputStream() cannot be called against this object type")
    }

    override fun refresh(asynchronous: Boolean, recursive: Boolean, postRunnable: Runnable?) {}
}

class S3VirtualFile(s3Vfs: S3VirtualFileSystem, val file: S3Object, parent: VirtualFile) :
    BaseS3VirtualFile(s3Vfs, parent, file) {

    override fun getName(): String = if (file.name.contains("/")) file.name.substringAfterLast("/") else file.name

    override fun isDirectory(): Boolean = false

    override fun getChildren(): Array<VirtualFile> = emptyArray()

    override fun getLength(): Long = file.size

    override fun getTimeStamp(): Long = file.lastModified.toEpochMilli()

    fun formatSize(): String = StringUtil.formatFileSize(file.size)
}

open class S3VirtualBucket(fileSystem: S3VirtualFileSystem, val s3Bucket: Bucket) :
    BaseS3VirtualFile(fileSystem, parent = null, key = S3Directory(s3Bucket.name(), "", fileSystem.client)) {

    val client: S3Client = fileSystem.client
    override fun getTimeStamp(): Long = s3Bucket.creationDate().toEpochMilli()

    fun getVirtualBucketName(): String = s3Bucket.name()

    override fun getChildren(): Array<VirtualFile> =
        S3Directory(s3Bucket.name(), "", fileSystem.client).children().sortedBy { it.bucket }
            .map {
                when (it) {
                    is S3Object -> S3VirtualFile(fileSystem, it, this)
                    is S3Directory -> S3VirtualDirectory(fileSystem, it, this)
                }
            }.toTypedArray()

    override fun isDirectory(): Boolean = true

    override fun getName(): String = getVirtualBucketName()
}

class S3VirtualDirectory(s3filesystem: S3VirtualFileSystem, private val directory: S3Directory, parent: VirtualFile) :
    BaseS3VirtualFile(s3filesystem, parent, directory) {

    override fun getChildren(): Array<VirtualFile> =
        directory.children().sortedBy { it.bucket }.filterNot { it.key == directory.key }
            .map {
                when (it) {
                    is S3Object -> S3VirtualFile(fileSystem, it, this)
                    is S3Directory -> S3VirtualDirectory(fileSystem, it, this)
                }
            }.toTypedArray()

    override fun isDirectory(): Boolean = true

    override fun getName(): String = directory.name
}
