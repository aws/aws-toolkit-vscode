// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.verifyZeroInteractions
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.DeleteBucketRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse
import software.amazon.awssdk.services.s3.model.ObjectVersion
import software.amazon.awssdk.services.s3.paginators.ListObjectVersionsIterable
import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.bucketActions.DeleteBucketAction
import java.util.function.Consumer

class DeleteBucketTestMock {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @Test
    fun deleteEmptyBucket() {
        val s3Mock = delegateMock<S3Client>()
        val mockBucket = S3BucketNode(projectRule.project, Bucket.builder().name("foo").build())
        val emptyVersionList = mutableListOf<ObjectVersion>()

        s3Mock.stub {
            on { listObjectVersionsPaginator(any<ListObjectVersionsRequest>()) } doReturn
                ListObjectVersionsIterable(s3Mock, ListObjectVersionsRequest.builder().build())
        }
        s3Mock.stub {
            on { listObjectVersions(any<ListObjectVersionsRequest>()) } doReturn
                ListObjectVersionsResponse.builder().versions(emptyVersionList).isTruncated(false).build()
        }
        mockClientManagerRule.manager().register(S3Client::class, s3Mock)

        val deleteBucketAction = DeleteBucketAction()
        deleteBucketAction.performDelete(mockBucket)
        verify(s3Mock).deleteBucket(any<Consumer<DeleteBucketRequest.Builder>>())
    }

    @Test
    fun deleteBucketWithVersionedObjects() {
        val s3Mock = delegateMock<S3Client>()
        val mockBucket = S3BucketNode(projectRule.project, Bucket.builder().name("foo").build())

        val objectVersionList = mutableListOf(
            ObjectVersion.builder().eTag("123").key("1111").build(),
            ObjectVersion.builder().eTag("123").key("1111").build()
        )

        s3Mock.stub {
            on { listObjectVersionsPaginator(any<ListObjectVersionsRequest>()) } doReturn
                ListObjectVersionsIterable(s3Mock, ListObjectVersionsRequest.builder().build())
        }
        s3Mock.stub {
            on { listObjectVersions(any<ListObjectVersionsRequest>()) } doReturn
                ListObjectVersionsResponse.builder().versions(objectVersionList).isTruncated(false).build()
        }
        mockClientManagerRule.manager().register(S3Client::class, s3Mock)

        val deleteBucketAction = DeleteBucketAction()
        deleteBucketAction.performDelete(mockBucket)
        verify(s3Mock).deleteObjects(any<Consumer<DeleteObjectsRequest.Builder>>())
        verify(s3Mock).deleteBucket(any<Consumer<DeleteBucketRequest.Builder>>())
    }

    @Test(expected = NullPointerException::class)
    fun deleteBucketWhichDoesNotExist() {
        val s3Mock = delegateMock<S3Client>()
        s3Mock.stub {
            on { listObjectVersionsPaginator(any<ListObjectVersionsRequest>()) } doReturn
                ListObjectVersionsIterable(s3Mock, ListObjectVersionsRequest.builder().build())
        }
        mockClientManagerRule.manager().register(S3Client::class, s3Mock)
        s3Mock.deleteBucketAndContents("")
        verifyZeroInteractions(s3Mock.deleteBucket(any<Consumer<DeleteBucketRequest.Builder>>()))
    }
}
