// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CopyObjectRequest
import software.amazon.awssdk.services.s3.model.CopyObjectResponse
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.objectActions.RenameObjectAction
import software.aws.toolkits.jetbrains.utils.delegateMock
import java.time.Instant

class RenameObjectTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val s3Client = delegateMock<S3Client>()
    @Test
    fun renameObjectTest() {
        val deleteCaptor = argumentCaptor<DeleteObjectRequest>()
        val copyCaptor = argumentCaptor<CopyObjectRequest>()

        val fileSystemMock = S3VirtualFileSystem(s3Client)
        val treeTableMock = delegateMock<S3TreeTable>()
        val virtualBucketMock = S3VirtualBucket(fileSystemMock, S3Bucket("TestBucket", s3Client, Instant.parse("1995-10-23T10:12:35Z")))
        val renameObjectMock = RenameObjectAction(treeTableMock, virtualBucketMock)

        s3Client.stub {
            on {
                copyObject(copyCaptor.capture())
            } doReturn CopyObjectResponse.builder()
                .versionId("1223")
                .build()
        }
        s3Client.stub {
            on {
                deleteObject(deleteCaptor.capture())
            } doReturn DeleteObjectResponse.builder()
                .versionId("1223")
                .deleteMarker(true)
                .requestCharged("yes")
                .build()
        }
        val testFile = delegateMock<VirtualFile> { on { name } doReturn "testKey" }
        mockClientManagerRule.manager().register(S3Client::class, s3Client)

        renameObjectMock.renameObjectAction(TEST_RENAME_KEY, testFile, s3Client)
        val copyRequestCapture = copyCaptor.firstValue
        Assertions.assertThat(copyRequestCapture.bucket()).isEqualTo("TestBucket")
        Assertions.assertThat(copyRequestCapture.copySource()).isEqualTo("TestBucket/testKey")

        val deleteRequestCapture = deleteCaptor.firstValue
        Assertions.assertThat(deleteRequestCapture.bucket()).isEqualTo("TestBucket")
        Assertions.assertThat(deleteRequestCapture.key()).isEqualTo("testKey")
    }

    companion object {
        const val TEST_RENAME_KEY = "RenameKey"
    }
}