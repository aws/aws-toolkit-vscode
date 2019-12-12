// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFileWrapper
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import org.assertj.core.api.Assertions
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.core.sync.ResponseTransformer
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction
import software.aws.toolkits.jetbrains.utils.delegateMock
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import java.time.Instant

class DownloadObjectTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @Test
    fun downloadObjectTest() {
        val downloadCaptor = argumentCaptor<GetObjectRequest>()
        val s3Client = delegateMock<S3Client> {
            on {
                getObject(downloadCaptor.capture(), any<ResponseTransformer<GetObjectResponse, GetObjectResponse>>())
            } doReturn GetObjectResponse.builder()
                .eTag("1111")
                .lastModified(Instant.parse("1995-10-23T10:12:35Z"))
                .build()
        }
        mockClientManagerRule.manager().register(S3Client::class, s3Client)

        val treeTableMock = delegateMock<S3TreeTable>()
        val virtualBucketMock = S3VirtualBucket(Bucket.builder().name("TestBucket").build())

        val testFile = FileUtil.createTempFile("myfile", ".txt")
        val objectToDownload = S3TreeObjectNode("TestBucket", null, "key", 42, Instant.ofEpochSecond(0))

        val downloadObjectMock = DownloadObjectAction(treeTableMock, virtualBucketMock)

        downloadObjectMock.downloadObjectAction(projectRule.project, s3Client, objectToDownload, VirtualFileWrapper(testFile))
        val downloadRequestCapture = downloadCaptor.firstValue
        Assertions.assertThat(downloadRequestCapture.bucket()).isEqualTo("TestBucket")
        Assertions.assertThat(downloadRequestCapture.key()).contains("key")
    }
}
