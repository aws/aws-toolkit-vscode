// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.openapi.fileTypes.ex.FileTypeManagerEx
import com.intellij.openapi.util.io.FileUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
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
import java.net.URL
import java.time.Instant

class S3VirtualBucketTest {
    private val projectRule = ProjectRule()
    private val mockClientManager = MockClientManagerRule()
    private val settingsManagerRule = ProjectAccountSettingsManagerRule(projectRule)

    @Rule
    @JvmField
    val chain = RuleChain(projectRule, mockClientManager, settingsManagerRule)

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

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

        val sut = S3VirtualBucket("TestBucket", "", s3Client, projectRule.project)
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

        val sut = S3VirtualBucket("TestBucket", "", s3Client, projectRule.project)
        runBlocking {
            sut.renameObject("key", "renamedKey")
        }

        val copyRequestCapture = copyCaptor.firstValue
        assertThat(copyRequestCapture.destinationBucket()).isEqualTo("TestBucket")
        assertThat(copyRequestCapture.sourceBucket()).isEqualTo("TestBucket")
        assertThat(copyRequestCapture.sourceKey()).isEqualTo("key")

        val deleteRequestCapture = deleteCaptor.firstValue
        assertThat(deleteRequestCapture.bucket()).isEqualTo("TestBucket")
        assertThat(deleteRequestCapture.key()).isEqualTo("key")
    }

    @Test
    fun uploadObject() {
        val s3Client = mockClientManager.create<S3Client>()

        s3Client.stub {
            on {
                putObject(any<PutObjectRequest>(), any<RequestBody>())
            } doReturn PutObjectResponse.builder()
                .versionId("VersionFoo")
                .build()
        }

        val testFile = tempFolder.newFile("someFile.html").toPath()

        val sut = S3VirtualBucket("TestBucket", "", s3Client, projectRule.project)
        runBlocking {
            sut.upload(projectRule.project, testFile, "TestFile")
        }

        argumentCaptor<PutObjectRequest, RequestBody>().let { (request, body) ->
            verify(s3Client).putObject(request.capture(), body.capture())

            assertThat(request.firstValue.bucket()).isEqualTo("TestBucket")
            assertThat(request.firstValue.key()).isEqualTo("TestFile")

            assertThat(body.firstValue.contentType()).isEqualTo("text/html")
        }
    }

    @Test
    fun downloadObject() {
        val s3Client = mockClientManager.create<S3Client>()
        val downloadCaptor = argumentCaptor<GetObjectRequest>()
        val testBucket = Bucket.builder().name("TestBucket").build()

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
        val sut = S3VirtualBucket(testBucket.name(), "", s3Client, projectRule.project)
        runBlocking {
            sut.download(projectRule.project, "key", null, testFile.outputStream())
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

        val sut = S3VirtualBucket("TestBucket", "", s3Client, projectRule.project)
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
            val sut = S3VirtualBucket("test-bucket", "", it, projectRule.project)

            assertThat(sut.generateUrl("prefix/key", null)).isEqualTo(URL("https://test-bucket.s3.us-west-2.amazonaws.com/prefix/key"))
        }
    }

    @Test
    fun getUrlWithVersion() {
        val awsConnectionManager = settingsManagerRule.settingsManager
        awsConnectionManager.changeRegionAndWait(AwsRegion("us-west-2", "US West (Oregon)", "aws"))

        // Use real manager for this since it can affect the S3Configuration that goes into S3Utilities
        AwsClientManager().getClient<S3Client>(awsConnectionManager.activeCredentialProvider, awsConnectionManager.activeRegion).use {
            val sut = S3VirtualBucket("test-bucket", "", it, projectRule.project)

            assertThat(sut.generateUrl("prefix/key", "123")).isEqualTo(URL("https://test-bucket.s3.us-west-2.amazonaws.com/prefix/key?versionId=123"))
        }
    }

    @Test
    fun getUrlError() {
        val awsConnectionManager = settingsManagerRule.settingsManager
        awsConnectionManager.changeRegionAndWait(AwsRegion("us-west-2", "US West (Oregon)", "aws"))

        // Use real manager for this since it can affect the S3Configuration that goes into S3Utilities
        AwsClientManager().getClient<S3Client>(awsConnectionManager.activeCredentialProvider, awsConnectionManager.activeRegion).use {
            val sut = S3VirtualBucket("test-bucket", "", it, projectRule.project)

            assertThatThrownBy {
                sut.generateUrl("", null)
            }
        }
    }

    @Test
    fun handleDeletedBucket() {
        val s3Mock = mockClientManager.create<S3Client>()
        val testBucket = Bucket.builder().name("TestBucket").build()
        val s3VirtualBucket = S3VirtualBucket(testBucket.name(), "", s3Mock, projectRule.project)
        runInEdtAndWait {
            runWriteAction {
                FileTypeManagerEx.getInstanceEx().associatePattern(
                    FileTypes.PLAIN_TEXT,
                    testBucket.name()
                )
            }
            assertThat(openEditor(projectRule.project, testBucket.name())).isNotNull
        }
        val fileEditorManager = FileEditorManager.getInstance(projectRule.project)
        assertThat(fileEditorManager.openFiles).contains(s3VirtualBucket)
        s3VirtualBucket.handleDeletedBucket()
        assertThat(fileEditorManager.openFiles).doesNotContain(s3VirtualBucket)
    }
}
