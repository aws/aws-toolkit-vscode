// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.icons.AllIcons
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
import software.amazon.awssdk.services.s3.model.CommonPrefix
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.S3Object
import software.aws.toolkits.core.utils.delegateMock
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class S3TreeDirectoryNodeTest {
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
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.directoryPath()).isEqualTo("my/folder/")
    }

    @Test
    fun `display name`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.displayName()).isEqualTo("folder")
    }

    @Test
    fun `get icon`() {
        val s3Client = delegateMock<S3Client>()
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.icon).isEqualTo(AllIcons.Nodes.Folder)
    }

    @Test
    fun `get children with no pagination`() {
        val requestCaptor = argumentCaptor<ListObjectsV2Request>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(requestCaptor.capture()) } doReturn ListObjectsV2Response.builder()
                .commonPrefixes(CommonPrefix.builder().prefix("my/folder/aFolder/").build(), CommonPrefix.builder().prefix("my/folder/zFolder/").build())
                .contents(createS3Object("my/folder/picture.png"), createS3Object("my/folder/file.txt"))
                .build()
        }
        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.children).containsExactly(
            S3TreeDirectoryNode(bucket, sut, "my/folder/aFolder/"),
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeObjectNode(sut, "my/folder/picture.png", objectSize, lastModifiedTime),
            S3TreeDirectoryNode(bucket, sut, "my/folder/zFolder/")
        )

        val request = requestCaptor.firstValue
        assertThat(request.bucket()).isEqualTo("foo")
        assertThat(request.prefix()).isEqualTo("my/folder/")
        assertThat(request.delimiter()).isEqualTo("/")
    }

    @Test
    fun `get children with pagination`() {
        val requestCaptor = argumentCaptor<ListObjectsV2Request>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(requestCaptor.capture()) } doReturn ListObjectsV2Response.builder()
                .contents(createS3Object("my/folder/picture.png"))
                .nextContinuationToken("Token")
                .build()
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder")

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/picture.png", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, "Token")
        )
    }

    @Test
    fun `get children with more loaded`() {
        val requestCaptor = argumentCaptor<ListObjectsV2Request>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(requestCaptor.capture()) }.thenReturn(
                ListObjectsV2Response.builder()
                    .contents(createS3Object("my/folder/file.txt"))
                    .nextContinuationToken("Token")
                    .build(),
                ListObjectsV2Response.builder()
                    .contents(createS3Object("my/folder/picture.png"))
                    .build()
            )
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, "Token")
        )

        (sut.children.last() as S3TreeContinuationNode<*>).loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeObjectNode(sut, "my/folder/picture.png", objectSize, lastModifiedTime)
        )

        assertThat(requestCaptor.allValues).hasSize(2)
        val firstRequest = requestCaptor.firstValue
        assertThat(firstRequest.bucket()).isEqualTo("foo")
        assertThat(firstRequest.prefix()).isEqualTo("my/folder/")
        assertThat(firstRequest.delimiter()).isEqualTo("/")
        assertThat(firstRequest.continuationToken()).isNull()

        val secondRequest = requestCaptor.secondValue
        assertThat(secondRequest.bucket()).isEqualTo("foo")
        assertThat(secondRequest.prefix()).isEqualTo("my/folder/")
        assertThat(secondRequest.delimiter()).isEqualTo("/")
        assertThat(secondRequest.continuationToken()).isEqualTo("Token")
    }

    @Test
    fun `get children fails shows error node`() {
        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(any<ListObjectsV2Request>()) } doThrow IllegalStateException("Bad!")
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder")

        assertThat(sut.children).containsExactly(
            S3TreeErrorNode(bucket, sut)
        )
    }

    @Test
    fun `load more fails once then succeeds`() {
        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(any<ListObjectsV2Request>()) }
                .thenReturn(
                    ListObjectsV2Response.builder()
                        .contents(createS3Object("my/folder/file.txt"))
                        .nextContinuationToken("Token")
                        .build()
                )
                .thenThrow(IllegalStateException("Bad!"))
                .thenReturn(
                    ListObjectsV2Response.builder()
                        .contents(createS3Object("my/folder/picture.png"))
                        .build()
                )
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, "Token")
        )

        (sut.children.last() as S3TreeContinuationNode<*>).loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeErrorContinuationNode(bucket, sut, sut.key, "Token")
        )

        (sut.children.last() as S3TreeContinuationNode<*>).loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeObjectNode(sut, "my/folder/picture.png", objectSize, lastModifiedTime)
        )
    }

    @Test
    fun `load more is idempotent`() {
        val requestCaptor = argumentCaptor<ListObjectsV2Request>()
        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(requestCaptor.capture()) }.thenReturn(
                ListObjectsV2Response.builder()
                    .contents(createS3Object("my/folder/file.txt"))
                    .nextContinuationToken("Token")
                    .build(),
                ListObjectsV2Response.builder()
                    .contents(createS3Object("my/folder/picture.png"))
                    .build()
            )
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeContinuationNode(bucket, sut, sut.key, "Token")
        )

        val continuationNode = sut.children.last() as S3TreeContinuationNode<*>
        continuationNode.loadMore()

        assertThat(sut.children).containsExactly(
            S3TreeObjectNode(sut, "my/folder/file.txt", objectSize, lastModifiedTime),
            S3TreeObjectNode(sut, "my/folder/picture.png", objectSize, lastModifiedTime)
        )

        continuationNode.loadMore()

        assertThat(sut.children).hasSize(2)
        assertThat(requestCaptor.allValues).hasSize(2)
    }

    @Test
    fun `load more only executes a single request`() {
        val latch = CountDownLatch(1)
        val executed = CountDownLatch(3)

        val s3Client = delegateMock<S3Client> {
            on { listObjectsV2(any<ListObjectsV2Request>()) }.thenReturn(
                ListObjectsV2Response.builder()
                    .contents(createS3Object("my/folder/file.txt"))
                    .nextContinuationToken("Token")
                    .build()
            ).thenAnswer {
                latch.await()

                ListObjectsV2Response.builder()
                    .contents(createS3Object("my/folder/picture.png"), createS3Object("my/folder/picture.png"))
                    .build()
            }
        }

        val bucket = S3VirtualBucket(s3Bucket.name(), "", s3Client, projectRule.project)
        val sut = S3TreeDirectoryNode(bucket, null, "my/folder/")
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
        verify(s3Client, times(2)).listObjectsV2(any<ListObjectsV2Request>())
    }

    private fun createS3Object(name: String) = S3Object.builder().key(name).size(objectSize).lastModified(lastModifiedTime).build()
}
