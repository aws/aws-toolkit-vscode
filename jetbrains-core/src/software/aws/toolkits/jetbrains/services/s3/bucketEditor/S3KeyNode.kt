// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketEditor

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.treeStructure.SimpleNode
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.S3VirtualDirectory

/**
 * Paginated S3KeyNode for TreeTable
 */
class S3KeyNode(val virtualFile: VirtualFile) : SimpleNode() {
    var prev = 0
    var next = Math.min(UPDATE_LIMIT, virtualFile.children.size)
    var currSize = 0
    var prevSize = 0

    override fun getChildren(): Array<S3KeyNode> {
        updateLimitsOnSizeChange()
        return when (virtualFile) {
            is S3VirtualBucket -> virtualFile.children
                .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
                .map { S3KeyNode(it) }
                .toTypedArray().sliceArray(prev..(next - 1))
            is S3VirtualDirectory -> virtualFile.children
                .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
                .map { S3KeyNode(it) }
                .toTypedArray()
            else -> emptyArray()
        }
    }

    override fun getName(): String = when (virtualFile) {
        is S3VirtualBucket -> virtualFile.getVirtualBucketName()
        else -> virtualFile.name
    }

    private fun updateLimitsOnSizeChange() {
        currSize = getNodeSize()
        if (prevSize != currSize) {
            if (next == prevSize) {
                next = Math.min(prev + UPDATE_LIMIT, currSize)
                prev = if (next == prev) prev - UPDATE_LIMIT else prev
            }
        }
        prevSize = currSize
    }

    private fun getNodeSize() = when (virtualFile) {
        is S3VirtualBucket -> virtualFile.children.size
        else -> currSize
    }

    fun updateLimitsOnButtonClick(increase: Boolean) {
        if (increase) {
            if (next < currSize) prev = next
            next = Math.min(next + UPDATE_LIMIT, currSize)
        } else {
            if (prev > START_SIZE) next = prev
            prev = Math.max(prev - UPDATE_LIMIT, START_SIZE)
        }
    }

    fun resetLimitsForSearch() {
        updateLimitsOnSizeChange()
        prev = START_SIZE
        next = currSize
    }

    companion object {
        /**
         * Page Limits
         */
        const val UPDATE_LIMIT = 30
        const val START_SIZE = 0
    }
}
