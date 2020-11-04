// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.verify
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.core.sync.ResponseTransformer
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.CopyObjectRequest
import software.amazon.awssdk.services.s3.model.CopyObjectResponse
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectResponse
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse
import software.amazon.awssdk.services.s3.model.DeletedObject
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import java.io.ByteArrayInputStream
import java.net.URL
import java.time.Instant

class S3VirtualBucketTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val settingsManagerRule = ProjectAccountSettingsManagerRule(projectRule)

    @Test
    fun deleteObjects() {
        val s3Client = mockClientManager.create<S3Client>()
        val deleteCaptor = argumentCaptor<DeleteObjectsRequest>()

        val objectsToDelete = mutableListOf<ObjectIdentifier>()
        objectsToDelete.add(ObjectIdentifier.builder().key("testKey").build())

        s3Client.stub {
            on { deleteObjects(deleteCaptor.capture()) } doReturn
                (
                    DeleteObjectsResponse.builder()
                        .requestCharged("yes")
                        .deleted(listOf(DeletedObject.builder().deleteMarker(true).key("testKey").build()))
                    ).build()
        }

        val sut = S3VirtualBucket(Bucket.builder().name("TestBucket").build(), s3Client)
        runBlocking {
            sut.deleteObjects(listOf("testKey"))
        }

        val deleteRequest = deleteCaptor.firstValue
        assertThat(deleteRequest.bucket()).isEqualTo("TestBucket")
        assertThat(deleteRequest.delete().objects()[0].key()).isEqualTo("testKey")
    }

    @Test
    fun renameObject() {
        val s3Client = mockClientManager.create<S3Client>()
        val deleteCaptor = argumentCaptor<DeleteObjectRequest>()
        val copyCaptor = argumentCaptor<CopyObjectRequest>()

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

        val sut = S3VirtualBucket(Bucket.builder().name("TestBucket").build(), s3Client)
        runBlocking {
            sut.renameObject("key", "renamedKey")
        }

        val copyRequestCapture = copyCaptor.firstValue
        assertThat(copyRequestCapture.destinationBucket()).isEqualTo("TestBucket")
        assertThat(copyRequestCapture.copySource()).isEqualTo("TestBucket/key")

        val deleteRequestCapture = deleteCaptor.firstValue
        assertThat(deleteRequestCapture.bucket()).isEqualTo("TestBucket")
        assertThat(deleteRequestCapture.key()).isEqualTo("key")
    }

    @Test
    fun uploadObject() {
        val s3Client = mockClientManager.create<S3Client>()
        val uploadCaptor = argumentCaptor<PutObjectRequest>()

        s3Client.stub {
            on {
                putObject(uploadCaptor.capture(), any<RequestBody>())
            } doReturn PutObjectResponse.builder()
                .versionId("VersionFoo")
                .build()
        }

        val testFile = mock<VirtualFile> { on { name } doReturn "TestFile" }
        testFile.stub { on { length } doReturn 341 }
        testFile.stub { on { inputStream } doReturn ByteArrayInputStream("Hello".toByteArray()) }

        val sut = S3VirtualBucket(Bucket.builder().name("TestBucket").build(), s3Client)
        runBlocking {
            sut.upload(projectRule.project, testFile.inputStream, testFile.length, "TestFile")
        }

        verify(s3Client).putObject(any<PutObjectRequest>(), any<RequestBody>())

        val uploadRequestCapture = uploadCaptor.firstValue
        assertThat(uploadRequestCapture.bucket()).isEqualTo("TestBucket")
        assertThat(uploadRequestCapture.key()).isEqualTo("TestFile")
    }

    @Test
    fun downloadObject() {
        val s3Client = mockClientManager.create<S3Client>()
        val downloadCaptor = argumentCaptor<GetObjectRequest>()

        s3Client.stub {
            on {
                getObject(downloadCaptor.capture(), any<ResponseTransformer<GetObjectResponse, GetObjectResponse>>())
            } doAnswer {
                @Suppress("UNCHECKED_CAST")
                val transformer = it.arguments[1] as ResponseTransformer<GetObjectResponse, GetObjectResponse>
                val data = "hello".toByteArray()
                transformer.transform(
                    GetObjectResponse.builder()
                        .eTag("1111")
                        .lastModified(Instant.parse("1995-10-23T10:12:35Z"))
                        .contentLength(data.size.toLong())
                        .build(),
                    AbortableInputStream.create(data.inputStream())
                )
            }
        }

        val testFile = FileUtil.createTempFile("myfile", ".txt")

        val sut = S3VirtualBucket(Bucket.builder().name("TestBucket").build(), s3Client)
        runBlocking {
            sut.download(projectRule.project, "key", testFile.outputStream())
        }

        val downloadRequestCapture = downloadCaptor.firstValue
        assertThat(downloadRequestCapture.bucket()).isEqualTo("TestBucket")
        assertThat(downloadRequestCapture.key()).contains("key")
    }

    @Test
    fun listObjects() {
        val s3Client = mockClientManager.create<S3Client>()
        val requestCaptor = argumentCaptor<ListObjectsV2Request>()

        s3Client.stub {
            on { listObjectsV2(requestCaptor.capture()) } doReturn ListObjectsV2Response.builder().build()
        }

        val sut = S3VirtualBucket(Bucket.builder().name("TestBucket").build(), s3Client)
        runBlocking {
            sut.listObjects("prefix/", "continuation")
        }

        val request = requestCaptor.firstValue
        assertThat(request.bucket()).isEqualTo("TestBucket")
        assertThat(request.prefix()).isEqualTo("prefix/")
        assertThat(request.delimiter()).isEqualTo("/")
    }

    @Test
    fun getUrl() {
        val awsConnectionManager = settingsManagerRule.settingsManager
        awsConnectionManager.changeRegionAndWait(AwsRegion("us-west-2", "US West (Oregon)", "aws"))

        // Use real manager for this since it can affect the S3Configuration that goes into S3Utilities
        AwsClientManager().getClient<S3Client>(awsConnectionManager.activeCredentialProvider, awsConnectionManager.activeRegion).use {
            val sut = S3VirtualBucket(Bucket.builder().name("test-bucket").build(), it)

            assertThat(sut.generateUrl("prefix/key")).isEqualTo(URL("https://test-bucket.s3.us-west-2.amazonaws.com/prefix/key"))
        }
    }

    @Test
    fun getUrlError() {
        val awsConnectionManager = settingsManagerRule.settingsManager
        awsConnectionManager.changeRegionAndWait(AwsRegion("us-west-2", "US West (Oregon)", "aws"))

        // Use real manager for this since it can affect the S3Configuration that goes into S3Utilities
        AwsClientManager().getClient<S3Client>(awsConnectionManager.activeCredentialProvider, awsConnectionManager.activeRegion).use {
            val sut = S3VirtualBucket(Bucket.builder().name("test-bucket").build(), it)

            assertThatThrownBy {
                sut.generateUrl("")
            }
        }
    }
}
