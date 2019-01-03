// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.filesystem

import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileVisitor

class VirtualFileWalker(
    private val block: (VirtualFile) -> Unit,
    private val skipHiddenDirectories: Boolean = true,
    private val excludedDirectories: Set<VirtualFile> = setOf()
) : VirtualFileVisitor<Any>() {
    override fun visitFileEx(file: VirtualFile): Result {
        if (file.isDirectory) {
            return if (skipHiddenDirectories && file.name.startsWith(".")) {
                VirtualFileVisitor.SKIP_CHILDREN
            } else if (excludedDirectories.contains(file)) {
                VirtualFileVisitor.SKIP_CHILDREN
            } else {
                VirtualFileVisitor.CONTINUE
            }
        }
        block(file)
        return VirtualFileVisitor.CONTINUE
    }
}

fun VirtualFile.walkFiles(block: (VirtualFile) -> Unit) = this.walkFiles(setOf(), block)

fun VirtualFile.walkFiles(excludedDirectories: Set<VirtualFile>, block: (VirtualFile) -> Unit) =
        VfsUtilCore.visitChildrenRecursively(this, VirtualFileWalker(block, excludedDirectories = excludedDirectories))
