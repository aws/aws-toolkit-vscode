package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileListener
import com.intellij.openapi.vfs.VirtualFileSystem
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.s3.S3Bucket
import software.aws.toolkits.core.s3.S3Directory
import software.aws.toolkits.core.s3.S3File
import software.aws.toolkits.core.s3.S3Key
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

// TODO: Do we even need this? If we implement LightVirtualFile then we might be able to do away with this (for now)
class S3VirtualFileSystem(val s3Client: S3Client) : VirtualFileSystem() {
    override fun deleteFile(requestor: Any?, vFile: VirtualFile) {
        TODO("not implemented")
    }

    override fun getProtocol() = "s3"

    override fun createChildDirectory(requestor: Any?, vDir: VirtualFile, dirName: String): VirtualFile {
        TODO("not implemented")
    }

    override fun addVirtualFileListener(listener: VirtualFileListener) {}

    override fun isReadOnly(): Boolean = true

    override fun findFileByPath(path: String): VirtualFile? {
        TODO("not implemented")
    }

    override fun renameFile(requestor: Any?, vFile: VirtualFile, newName: String) {
        TODO("not implemented")
    }

    override fun createChildFile(requestor: Any?, vDir: VirtualFile, fileName: String): VirtualFile {
        TODO("not implemented")
    }

    override fun refreshAndFindFileByPath(path: String): VirtualFile? {
        TODO("not implemented")
    }

    override fun removeVirtualFileListener(listener: VirtualFileListener) {}

    override fun copyFile(
        requestor: Any?,
        virtualFile: VirtualFile,
        newParent: VirtualFile,
        copyName: String
    ): VirtualFile {
        TODO("not implemented")
    }

    override fun moveFile(requestor: Any?, vFile: VirtualFile, newParent: VirtualFile) {
        TODO("not implemented")
    }

    override fun refresh(asynchronous: Boolean) {
        TODO("not implemented")
    }
}

abstract class BaseS3VirtualFile(
    protected val fileSystem: S3VirtualFileSystem,
    private val parent: VirtualFile?,
    protected open val key: S3Key
) : VirtualFile() {

    override fun getLength(): Long = 0

    override fun getFileSystem(): VirtualFileSystem = fileSystem

    override fun getPath() = "${key.bucket}/${key.key}"

    override fun getTimeStamp(): Long = -1L

    override fun getName(): String = key.name

    override fun isValid(): Boolean = true

    @Throws(IOException::class)
    override fun contentsToByteArray(): ByteArray {
        throw IOException("contentsToByteArray() cannot be called against this object type: $javaClass")
    }

    @Throws(IOException::class)
    override fun getInputStream(): InputStream {
        throw IOException("getInputStream() cannot be called against this object type: $javaClass")
    }

    override fun getParent(): VirtualFile? = parent

    override fun isWritable(): Boolean = false

    @Throws(IOException::class)
    override fun getOutputStream(requestor: Any?, newModificationStamp: Long, newTimeStamp: Long): OutputStream {
        throw IOException("getOutputStream() cannot be called against this object type: $javaClass")
    }

    override fun refresh(asynchronous: Boolean, recursive: Boolean, postRunnable: Runnable?) {}

    override fun equals(other: Any?): Boolean {
        if (this === other) {
            return true
        }
        return other is BaseS3VirtualFile && javaClass == other.javaClass && other.key == key
    }

    override fun hashCode(): Int {
        var result = javaClass.hashCode()
        result = 31 * result + key.hashCode()
        return result
    }
}

abstract class BaseS3VirtualObjectContainer(
    fileSystem: S3VirtualFileSystem,
    override val key: S3Directory,
    parent: VirtualFile?
) : BaseS3VirtualFile(fileSystem, parent, key) {
    override fun isDirectory() = true

    override fun getChildren(): Array<VirtualFile> =
            key.children().sortedBy { it.javaClass.simpleName }.sortedBy { it.name }.map {
                when (it) {
                    is S3Directory -> S3VirtualDirectory(fileSystem, it, this)
                    is S3File -> S3VirtualFile(fileSystem, it, this)
                }
            }.toTypedArray()
}

class S3VirtualBucket(fileSystem: S3VirtualFileSystem, override val key: S3Bucket) :
        BaseS3VirtualObjectContainer(fileSystem, key, parent = null) {

    val bucket: S3Bucket = key

    override fun getTimeStamp() = key.creationDate?.toEpochMilli() ?: -1
}

class S3VirtualDirectory(
    s3FileSystem: S3VirtualFileSystem,
    key: S3Directory,
    parent: VirtualFile
) : BaseS3VirtualObjectContainer(s3FileSystem, key, parent)

class S3VirtualFile(
    s3FileSystem: S3VirtualFileSystem,
    val file: S3File,
    parent: VirtualFile
) : BaseS3VirtualFile(s3FileSystem, parent, file) {

    override fun getChildren(): Array<VirtualFile> = emptyArray()

    override fun isDirectory() = false

    override fun getTimeStamp() = file.lastModified.toEpochMilli()

    override fun getLength() = file.size

    @Throws(IOException::class)
    override fun contentsToByteArray(): ByteArray = file.getByteArray()

    @Throws(IOException::class)
    override fun getInputStream(): InputStream = file.getInputStream()
}