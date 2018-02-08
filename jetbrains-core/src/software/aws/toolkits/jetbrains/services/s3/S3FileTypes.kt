package software.aws.toolkits.jetbrains.services.s3

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileTypes.FileTypeConsumer
import com.intellij.openapi.fileTypes.FileTypeFactory
import com.intellij.openapi.fileTypes.ex.FileTypeIdentifiableByVirtualFile
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.core.Icons.Services.S3_BUCKET_ICON
import javax.swing.Icon

class BucketFileType : FileTypeIdentifiableByVirtualFile {
    override fun getDefaultExtension() = ""

    override fun getIcon(): Icon = S3_BUCKET_ICON

    override fun getCharset(file: VirtualFile, content: ByteArray) = null

    override fun getName() = "S3 Bucket"

    override fun getDescription() = name

    override fun isBinary() = true

    override fun isMyFileType(file: VirtualFile) = file is S3VirtualBucket

    override fun isReadOnly() = true
}

class DirectoryFileType : FileTypeIdentifiableByVirtualFile {
    override fun getDefaultExtension() = ""

    override fun getIcon(): Icon = AllIcons.Nodes.Folder

    override fun getCharset(file: VirtualFile, content: ByteArray) = null

    override fun getName() = "S3 Directory"

    override fun getDescription() = name

    override fun isBinary() = true

    override fun isMyFileType(file: VirtualFile) = file is S3VirtualDirectory

    override fun isReadOnly() = true
}

class S3FileTypeFactory : FileTypeFactory() {
    override fun createFileTypes(consumer: FileTypeConsumer) {
        consumer.consume(BucketFileType())
        consumer.consume(DirectoryFileType())
    }
}