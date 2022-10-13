// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.fileTypes.UnknownFileType
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.utils.delegateMock
import java.time.Instant

class S3TreeObjectVersionNodeTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val s3Client = delegateMock<S3Client>()
    private val lastModifiedTime = Instant.now()
    private val objectSize = 1L
    private val s3Bucket = Bucket.builder().name("foo").build()

    private lateinit var bucket: S3VirtualBucket
    private lateinit var dirNode: S3TreeDirectoryNode

    @Before
    fun setUp() {
        bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        dirNode = S3TreeDirectoryNode(bucket, null, "my/folder/")
    }

    @Test
    fun `directory path`() {
        val parent = S3TreeObjectNode(dirNode, "my/folder/file.txt", objectSize, lastModifiedTime)
        val sut = S3TreeObjectVersionNode(parent, "version1", objectSize, lastModifiedTime)

        assertThat(sut.directoryPath()).isEqualTo("my/folder/")
    }

    @Test
    fun `display name`() {
        val parent = S3TreeObjectNode(dirNode, "my/folder/file.txt", objectSize, lastModifiedTime)
        val sut = S3TreeObjectVersionNode(parent, "version1", objectSize, lastModifiedTime)

        assertThat(sut.displayName()).isEqualTo("version1")
    }

    @Test
    fun `file name with extension`() {
        val parent = S3TreeObjectNode(dirNode, "my/folder/file.txt", objectSize, lastModifiedTime)
        val sut = S3TreeObjectVersionNode(parent, "version1", objectSize, lastModifiedTime)

        assertThat(sut.fileName()).isEqualTo("file@version1.txt")
    }

    @Test
    fun `file name without extension`() {
        val parent = S3TreeObjectNode(dirNode, "my/folder/file", objectSize, lastModifiedTime)
        val sut = S3TreeObjectVersionNode(parent, "version1", objectSize, lastModifiedTime)

        assertThat(sut.fileName()).isEqualTo("file@version1")
    }

    @Test
    fun `known file type icon`() {
        val parent = S3TreeObjectNode(dirNode, "my/folder/file.txt", objectSize, lastModifiedTime)
        val sut = S3TreeObjectVersionNode(parent, "version1", objectSize, lastModifiedTime)

        assertThat(sut.icon).isEqualTo(PlainTextFileType.INSTANCE.icon)
    }

    @Test
    fun `unknown file type icon`() {
        val parent = S3TreeObjectNode(dirNode, "my/folder/file.unknownFile", objectSize, lastModifiedTime)
        val sut = S3TreeObjectVersionNode(parent, "version1", objectSize, lastModifiedTime)

        assertThat(sut.icon).isEqualTo(UnknownFileType.INSTANCE.icon)
    }
}
