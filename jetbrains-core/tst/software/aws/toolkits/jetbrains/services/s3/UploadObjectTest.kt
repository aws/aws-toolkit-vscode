// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.vfs.VirtualFile
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.objectActions.UploadObjectAction
import software.aws.toolkits.jetbrains.utils.delegateMock
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import java.io.ByteArrayInputStream
import java.time.Instant
import javax.swing.JButton
import javax.swing.JTextField

class UploadObjectTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule { projectRule.project }

    @Test
    fun uploadObjectTest() {
        val uploadCaptor = argumentCaptor<PutObjectRequest>()
        val s3Client = delegateMock<S3Client> {
            on {
                putObject(uploadCaptor.capture(), any<RequestBody>())
            } doReturn PutObjectResponse.builder()
                .versionId("VersionFoo")
                .build()
        }
        mockClientManager.manager().register(S3Client::class, s3Client)

        val fileSystemMock = S3VirtualFileSystem(s3Client)
        val virtualBucket =
            S3VirtualBucket(fileSystemMock, S3Bucket("TestBucket", s3Client, Instant.parse("1995-10-23T10:12:35Z")))
        val treeTableMock = delegateMock<S3TreeTable>()
        val mockButton = delegateMock<JButton>()
        val mockTextField = delegateMock<JTextField>()

        val testFile = delegateMock<VirtualFile> { on { name } doReturn "TestFile" }
        testFile.stub { on { length } doReturn 341 }
        testFile.stub { on { inputStream } doReturn ByteArrayInputStream("Hello".toByteArray()) }

        val uploadObjectMock = UploadObjectAction(virtualBucket, treeTableMock, mockButton, mockTextField)

        uploadObjectMock.uploadObjectAction(s3Client, projectRule.project, testFile, null)
        verify(s3Client).putObject(any<PutObjectRequest>(), any<RequestBody>())

        val uploadRequestCapture = uploadCaptor.firstValue
        Assertions.assertThat(uploadRequestCapture.bucket()).isEqualTo("TestBucket")
        Assertions.assertThat(uploadRequestCapture.key()).isEqualTo("TestFile")
    }
}