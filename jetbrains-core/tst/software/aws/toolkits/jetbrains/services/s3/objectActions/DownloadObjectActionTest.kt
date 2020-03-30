// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TestDialog
import com.intellij.testFramework.ProjectRule
import com.intellij.util.io.createFile
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.core.sync.ResponseTransformer
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.S3Exception
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution
import java.io.ByteArrayInputStream
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class DownloadObjectActionTest {
    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule(projectRule)

    @After
    fun tearDown() {
        Messages.setTestDialog(TestDialog.DEFAULT)
    }

    @Test
    fun downloadSingleFileToFile() {
        val destinationFile = tempFolder.newFile()

        val (s3Client, countDownLatch) = setUpS3Mock(1)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1")

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFile.toPath())
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFile).hasContent("testFile-1-content")
    }

    @Test
    fun downloadSingleFileToFolder() {
        val destinationFolder = tempFolder.newFolder().toPath()

        val (s3Client, countDownLatch) = setUpS3Mock(1)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1")

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
    }

    @Test
    fun downloadSingleFileToFolderWithConflictSkip() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-1").createFile()

        val (s3Client, countDownLatch) = setUpS3Mock(0)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1")

        setUpConflictResolutionResponses(
            ConflictResolution.SINGLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP
        )

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("")
    }

    @Test
    fun downloadSingleFileToFolderWithConflictOverwrite() {
        val destinationFolder = tempFolder.newFolder().toPath()

        val (s3Client, countDownLatch) = setUpS3Mock(1)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1")

        setUpConflictResolutionResponses(
            ConflictResolution.SINGLE_FILE_RESOLUTIONS,
            ConflictResolution.OVERWRITE
        )

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
    }

    @Test
    fun downloadMultipleFiles() {
        val destinationFolder = tempFolder.newFolder().toPath()

        val (s3Client, countDownLatch) = setUpS3Mock(3)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1", "testFile-2", "testFile-3")

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("testFile-2-content")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
    }

    @Test
    fun downloadMultipleFilesConflictSkipSome() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-2").createFile()
        destinationFolder.resolve("testFile-4").createFile()

        val (s3Client, countDownLatch) = setUpS3Mock(3)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1", "testFile-2", "testFile-3", "testFile-4", "testFile-5")

        setUpConflictResolutionResponses(
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP,
            ConflictResolution.SKIP
        )

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
        assertThat(destinationFolder.resolve("testFile-4")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-5")).hasContent("testFile-5-content")
    }

    @Test
    fun downloadMultipleFilesConflictSkipThenOverwriteRest() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-2").createFile()
        destinationFolder.resolve("testFile-4").createFile()
        destinationFolder.resolve("testFile-5").createFile()

        val (s3Client, countDownLatch) = setUpS3Mock(4)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1", "testFile-2", "testFile-3", "testFile-4", "testFile-5")

        setUpConflictResolutionResponses(
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP,
            ConflictResolution.OVERWRITE_ALL
        )

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
        assertThat(destinationFolder.resolve("testFile-4")).hasContent("testFile-4-content")
        assertThat(destinationFolder.resolve("testFile-5")).hasContent("testFile-5-content")
    }

    @Test
    fun downloadMultipleFilesConflictSkipAll() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-2").createFile()
        destinationFolder.resolve("testFile-4").createFile()

        val (s3Client, countDownLatch) = setUpS3Mock(3)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1", "testFile-2", "testFile-3", "testFile-4", "testFile-5")

        setUpConflictResolutionResponses(
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP_ALL
        )

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
        assertThat(destinationFolder.resolve("testFile-4")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-5")).hasContent("testFile-5-content")
    }

    @Test
    fun singleExceptionLeadsToPartialDownload() {
        val destinationFolder = tempFolder.newFolder().toPath()

        val (s3Client, countDownLatch) = setUpS3Mock(2, setOf("testFile-2"))
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1", "testFile-2", "testFile-3")

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        // Latch is counted down before the delete on fail
        retryableAssert {
            assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
            assertThat(destinationFolder.resolve("testFile-2")).doesNotExist()
            assertThat(destinationFolder.resolve("testFile-3")).doesNotExist()
        }
    }

    @Test
    fun promptCancelIsSkip() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-1").createFile()

        val (s3Client, countDownLatch) = setUpS3Mock(0)
        val s3TreeTable = setUpS3TreeTable(s3Client, "testFile-1")

        Messages.setTestDialog {
            -1 // Means cancel (esc)
        }

        val action = DownloadObjectAction(projectRule.project, s3TreeTable, destinationFolder)
        action.actionPerformed(AnActionEvent.createFromDataContext(ActionPlaces.UNKNOWN, null, DataContext.EMPTY_CONTEXT))

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue()

        assertThat(destinationFolder.resolve("testFile-1")).hasContent("")
    }

    private fun setUpConflictResolutionResponses(choices: List<ConflictResolution>, vararg responses: ConflictResolution) {
        var responseNum = 0
        Messages.setTestDialog {
            choices.indexOf(responses.get(responseNum++))
        }
    }

    private fun setUpS3TreeTable(s3Client: S3Client, vararg selectedFiles: String): S3TreeTable {
        val objectNodes = selectedFiles.map {
            S3TreeObjectNode("testBucket", null, it, 1, Instant.now())
        }

        return mock {
            on { getSelectedNodes() }.thenReturn(objectNodes)

            on { bucket }.thenReturn(S3VirtualBucket(Bucket.builder().name("testBucket").build(), s3Client))
        }
    }

    private fun setUpS3Mock(numFiles: Int, errorFiles: Set<String> = emptySet()): Pair<S3Client, CountDownLatch> {
        val countDownLatch = CountDownLatch(numFiles)

        val s3Client = mockClientManager.create<S3Client>().stub {
            on {
                getObject(any<GetObjectRequest>(), any<ResponseTransformer<GetObjectResponse, GetObjectResponse>>())
            } doAnswer {
                val request = it.arguments[0] as GetObjectRequest

                if (request.key() in errorFiles) {
                    countDownLatch.countDown()
                    throw S3Exception.builder().message("Test Error for ${request.key()}").build()
                }

                @Suppress("UNCHECKED_CAST")
                val transformer = it.arguments[1] as ResponseTransformer<GetObjectResponse, GetObjectResponse>

                val content = "${request.key()}-content".toByteArray()

                val delegate = object : ByteArrayInputStream(content) {
                    override fun close() {
                        super.close()
                        countDownLatch.countDown()
                    }
                }

                transformer.transform(
                    GetObjectResponse.builder()
                        .eTag("1111")
                        .lastModified(Instant.parse("1995-10-23T10:12:35Z"))
                        .contentLength(content.size.toLong())
                        .build(),
                    AbortableInputStream.create(delegate)
                )
            }
        }

        return Pair(s3Client, countDownLatch)
    }
}
