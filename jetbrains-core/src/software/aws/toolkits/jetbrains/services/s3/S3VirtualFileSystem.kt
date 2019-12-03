// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileListener
import com.intellij.openapi.vfs.VirtualFileSystem
import software.amazon.awssdk.services.s3.S3Client

class S3VirtualFileSystem(val client: S3Client) : VirtualFileSystem() {

    override fun getProtocol(): String = "S3"

    override fun isReadOnly(): Boolean = false

    override fun refresh(asynchronous: Boolean) {}

    override fun addVirtualFileListener(listener: VirtualFileListener) {}

    override fun findFileByPath(path: String): VirtualFile? = null

    override fun refreshAndFindFileByPath(path: String): VirtualFile? = null

    override fun removeVirtualFileListener(listener: VirtualFileListener) {}

    override fun moveFile(requestor: Any?, vFile: VirtualFile, newParent: VirtualFile) {
        throw UnsupportedOperationException("moveFile() cannot be called against this object type")
    }

    override fun renameFile(requestor: Any?, vFile: VirtualFile, newName: String) {
        throw UnsupportedOperationException("renameFile() cannot be called against this object type")
    }

    override fun copyFile(requestor: Any?, virtualFile: VirtualFile, newParent: VirtualFile, copyName: String): VirtualFile {
        throw UnsupportedOperationException("copyFile() cannot be called against this object type")
    }

    override fun deleteFile(requestor: Any?, vFile: VirtualFile) {
        throw UnsupportedOperationException("deleteFile() cannot be called against this object type")
    }

    override fun createChildDirectory(requestor: Any?, vDir: VirtualFile, dirName: String): VirtualFile {
        throw UnsupportedOperationException("createChildDirectory() cannot be called against this object type")
    }

    override fun createChildFile(requestor: Any?, vDir: VirtualFile, fileName: String): VirtualFile {
        throw UnsupportedOperationException("createChildDirectory() cannot be called against this object type")
    }
}
