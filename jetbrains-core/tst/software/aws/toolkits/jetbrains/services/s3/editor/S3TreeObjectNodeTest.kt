// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.fileTypes.UnknownFileType
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse
import software.amazon.awssdk.services.s3.model.ObjectVersion
import software.aws.toolkits.core.utils.delegateMock
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class S3TreeObjectNodeTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val lastModifiedTime = Instant.now()
    private val objectSize = 1L
    private val s3Bucket = Bucket.builder().name("foo").build()

    @Test
    fun `directory path`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/file.txt", objectSize, lastModifiedTime)

        assertThat(sut.directoryPath()).isEqualTo("my/folder/")
    }

    @Test
    fun `display name`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/file.txt", objectSize, lastModifiedTime)

        assertThat(sut.displayName()).isEqualTo("file.txt")
    }

    @Test
    fun `file name with extension`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/file.txt", objectSize, lastModifiedTime)

        assertThat(sut.fileName()).isEqualTo("file.txt")
    }

    @Test
    fun `file name without extension`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/file", objectSize, lastModifiedTime)

        assertThat(sut.displayName()).isEqualTo("file")
    }

    @Test
    fun `known file type icon`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/file.txt", objectSize, lastModifiedTime)

        assertThat(sut.icon).isEqualTo(PlainTextFileType.INSTANCE.icon)
    }

    @Test
    fun `unknown file type icon`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/file.unknownFile", objectSize, lastModifiedTime)

        assertThat(sut.icon).isEqualTo(UnknownFileType.INSTANCE.icon)
    }

    @Test
    fun `showHistory false has no children`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = false

        assertThat(sut.children).isEmpty()
    }

    @Test
    fun `get children with no pagination`() {
        val requestCaptor = argumentCaptor<ListObjectVersionsRequest>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(requestCaptor.capture()) } doReturn
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "1"), createS3ObjectVersion("my/folder/picture.png", "2"))
                    .build()
        }
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime)
        )

        val request = requestCaptor.firstValue
        assertThat(request.bucket()).isEqualTo("foo")
        assertThat(request.prefix()).isEqualTo("my/folder/picture.png")
    }

    @Test
    fun `get children with pagination`() {
        val requestCaptor = argumentCaptor<ListObjectVersionsRequest>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(requestCaptor.capture()) } doReturn ListObjectVersionsResponse.builder()
                .versions(createS3ObjectVersion("my/folder/picture.png", "1"), createS3ObjectVersion("my/folder/picture.png", "2"))
                .nextKeyMarker("KeyToken")
                .nextVersionIdMarker("VersionToken")
                .isTruncated(true)
                .build()
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, VersionContinuationToken("KeyToken", "VersionToken"))
        )
    }

    @Test
    fun `get children must match key`() {
        val requestCaptor = argumentCaptor<ListObjectVersionsRequest>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(requestCaptor.capture()) } doReturn ListObjectVersionsResponse.builder()
                .versions(createS3ObjectVersion("my/folder/picture.png", "1"), createS3ObjectVersion("my/folder/file.txt", "1"))
                .nextKeyMarker("KeyToken")
                .nextVersionIdMarker("VersionToken")
                .isTruncated(true)
                .build()
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, VersionContinuationToken("KeyToken", "VersionToken"))
        )
    }

    @Test
    fun `get children fails`() {
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(any<ListObjectVersionsRequest>()) } doThrow IllegalStateException("Network broke")
        }
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime).apply { showHistory = true }

        assertThat(sut.children).containsExactly(
            S3TreeErrorNode(bucket, sut)
        )
    }

    @Test
    fun `get children fails with pagination`() {
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(any<ListObjectVersionsRequest>()) }
                .thenReturn(
                    ListObjectVersionsResponse.builder()
                        .versions(createS3ObjectVersion("my/folder/picture.png", "1"))
                        .nextKeyMarker("KeyToken")
                        .nextVersionIdMarker("VersionToken")
                        .isTruncated(true)
                        .build()
                )
                .thenThrow(IllegalStateException("Network broke"))
                .thenReturn(
                    ListObjectVersionsResponse.builder()
                        .versions(createS3ObjectVersion("my/folder/picture.png", "2"))
                        .isTruncated(false)
                        .build()
                )
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, VersionContinuationToken("KeyToken", "VersionToken"))
        )

        (sut.children.last() as S3TreeContinuationNode<*>).loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeErrorContinuationNode(bucket, sut, sut.key, VersionContinuationToken("KeyToken", "VersionToken"))
        )

        (sut.children.last() as S3TreeContinuationNode<*>).loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime)
        )
    }

    @Test
    fun `get children ignores versionId 'null'`() {
        val requestCaptor = argumentCaptor<ListObjectVersionsRequest>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(requestCaptor.capture()) } doReturn
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "null"))
                    .build()
        }
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).isEmpty()
    }

    @Test
    fun `get children with more loaded`() {
        val requestCaptor = argumentCaptor<ListObjectVersionsRequest>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(requestCaptor.capture()) }.thenReturn(
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "1"), createS3ObjectVersion("my/folder/picture.png", "2"))
                    .nextKeyMarker("KeyToken")
                    .nextVersionIdMarker("VersionToken")
                    .isTruncated(true)
                    .build(),
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "3"))
                    .build()
            )
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, VersionContinuationToken("KeyToken", "VersionToken"))
        )

        (sut.children.last() as S3TreeContinuationNode<*>).loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "3", objectSize, lastModifiedTime)
        )

        assertThat(requestCaptor.allValues).hasSize(2)
        val firstRequest = requestCaptor.firstValue
        assertThat(firstRequest.bucket()).isEqualTo("foo")
        assertThat(firstRequest.prefix()).isEqualTo("my/folder/picture.png")
        assertThat(firstRequest.keyMarker()).isNull()
        assertThat(firstRequest.versionIdMarker()).isNull()

        val secondRequest = requestCaptor.secondValue
        assertThat(secondRequest.bucket()).isEqualTo("foo")
        assertThat(secondRequest.prefix()).isEqualTo("my/folder/picture.png")
        assertThat(secondRequest.keyMarker()).isEqualTo("KeyToken")
        assertThat(secondRequest.versionIdMarker()).isEqualTo("VersionToken")
    }

    @Test
    fun `load more is idempotent`() {
        val requestCaptor = argumentCaptor<ListObjectVersionsRequest>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(requestCaptor.capture()) }.thenReturn(
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "1"), createS3ObjectVersion("my/folder/picture.png", "2"))
                    .nextKeyMarker("KeyToken")
                    .nextVersionIdMarker("VersionToken")
                    .isTruncated(true)
                    .build(),
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "3"))
                    .build()
            )
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, VersionContinuationToken("KeyToken", "VersionToken"))
        )

        val continuationNode = sut.children.last() as S3TreeContinuationNode<*>
        continuationNode.loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectVersionNode(sut, "1", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "2", objectSize, lastModifiedTime),
            S3TreeObjectVersionNode(sut, "3", objectSize, lastModifiedTime)
        )

        continuationNode.loadMore()

        assertThat(sut.children).hasSize(3)
        assertThat(requestCaptor.allValues).hasSize(2)
    }

    @Test
    fun `load more only executes a single request`() {
        val latch = CountDownLatch(1)
        val executed = CountDownLatch(3)

        val s3Client = delegateMock<S3Client> {
            on { listObjectVersions(any<ListObjectVersionsRequest>()) }.thenReturn(
                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "1"))
                    .nextKeyMarker("KeyToken")
                    .nextVersionIdMarker("VersionToken")
                    .isTruncated(true)
                    .build()
            ).thenAnswer {
                latch.await()

                ListObjectVersionsResponse.builder()
                    .versions(createS3ObjectVersion("my/folder/picture.png", "2"), createS3ObjectVersion("my/folder/picture.png", "3"))
                    .build()
            }
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val parent = S3TreeDirectoryNode(bucket, null, "my/folder/")
        val sut = S3TreeObjectNode(parent, "my/folder/picture.png", objectSize, lastModifiedTime)
        sut.showHistory = true

        val continuationNode = sut.children.last() as S3TreeContinuationNode<*>

        repeat(3) {
            thread(start = true) {
                continuationNode.loadMore()
                executed.countDown()
            }
        }

        latch.countDown()

        assertThat(executed.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(sut.children).hasSize(3)
        verify(s3Client, times(2)).listObjectVersions(any<ListObjectVersionsRequest>())
    }

    private fun createS3ObjectVersion(name: String, versionId: String) =
        ObjectVersion.builder().key(name).versionId(versionId).size(objectSize).lastModified(lastModifiedTime).build()
}
