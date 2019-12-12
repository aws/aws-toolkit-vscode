// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.services.s3.model.Bucket

class S3VirtualBucket(val s3Bucket: Bucket) : LightVirtualFile() {
    override fun getName(): String = s3Bucket.name()
    override fun isWritable(): Boolean = false
    override fun getPath(): String = s3Bucket.name()
    override fun isValid(): Boolean = true
    override fun getParent(): VirtualFile? = null
    override fun toString(): String = s3Bucket.name()
    override fun isDirectory(): Boolean = true
}
