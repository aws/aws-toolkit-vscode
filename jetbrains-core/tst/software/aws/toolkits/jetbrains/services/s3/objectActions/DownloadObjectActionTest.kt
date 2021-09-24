// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.ui.TestDialog
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.testFramework.DisposableRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.s3.model.S3Exception
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution
import software.aws.toolkits.jetbrains.utils.createMockFileChooser
import java.io.OutputStream
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class DownloadObjectActionTest : ObjectActionTestBase() {
    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val testDisposable = DisposableRule()

    override val sut = DownloadObjectAction()

    @After
    fun tearDown() {
        TestDialogManager.setTestDialog(TestDialog.DEFAULT)
    }

    @Test
    fun `download action is disabled on empty selection`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isFalse
    }

    @Test
    fun `download action is disabled on directory selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `download action is enabled on object selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `download action is enabled on object version selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `download action is disabled on mix of object and directory selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            dir,
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `download action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `download action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun downloadSingleFileToFile() {
        val destinationFile = tempFolder.newFile().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFile)

        val testData = listOf(
            TestData("testFile-1")
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFile).hasContent("testFile-1-content")
    }

    @Test
    fun downloadSingleFileToFolder() {
        val destinationFolder = tempFolder.newFolder().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1")
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
    }

    @Test
    fun downloadSingleFileToFolderWithConflictSkip() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-1").touch()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        setUpConflictResolutionResponses(
            ConflictResolution.SINGLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP
        )

        val testData = listOf(
            TestData("testFile-1")
        )

        // 0 due to ee skipped our only file
        val countDownLatch = setUpS3Mock(testData, numberOfDownloads = 0)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("")
    }

    @Test
    fun downloadSingleFileToFolderWithConflictOverwrite() {
        val destinationFolder = tempFolder.newFolder().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        setUpConflictResolutionResponses(
            ConflictResolution.SINGLE_FILE_RESOLUTIONS,
            ConflictResolution.OVERWRITE
        )

        val testData = listOf(
            TestData("testFile-1")
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
    }

    @Test
    fun downloadMultipleFiles() {
        val destinationFolder = tempFolder.newFolder().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1"),
            TestData("testFile-2"),
            TestData("testFile-3")
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("testFile-2-content")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
    }

    @Test
    fun downloadMultipleFilesConflictSkipSome() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-2").touch()
        destinationFolder.resolve("testFile-4").touch()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1"),
            TestData("testFile-2"),
            TestData("testFile-3"),
            TestData("testFile-4"),
            TestData("testFile-5")
        )

        setUpConflictResolutionResponses(
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP,
            ConflictResolution.SKIP
        )

        val countDownLatch = setUpS3Mock(testData, numberOfDownloads = 3)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
        assertThat(destinationFolder.resolve("testFile-4")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-5")).hasContent("testFile-5-content")
    }

    @Test
    fun downloadMultipleFilesConflictSkipThenOverwriteRest() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-2").touch()
        destinationFolder.resolve("testFile-4").touch()
        destinationFolder.resolve("testFile-5").touch()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1"),
            TestData("testFile-2"),
            TestData("testFile-3"),
            TestData("testFile-4"),
            TestData("testFile-5")
        )

        setUpConflictResolutionResponses(
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP,
            ConflictResolution.OVERWRITE_ALL
        )

        val countDownLatch = setUpS3Mock(testData, numberOfDownloads = 4)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
        assertThat(destinationFolder.resolve("testFile-4")).hasContent("testFile-4-content")
        assertThat(destinationFolder.resolve("testFile-5")).hasContent("testFile-5-content")
    }

    @Test
    fun downloadMultipleFilesConflictSkipAll() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-2").touch()
        destinationFolder.resolve("testFile-4").touch()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1"),
            TestData("testFile-2"),
            TestData("testFile-3"),
            TestData("testFile-4"),
            TestData("testFile-5")
        )

        setUpConflictResolutionResponses(
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS,
            ConflictResolution.SKIP_ALL
        )

        val countDownLatch = setUpS3Mock(testData, numberOfDownloads = 3)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-3")).hasContent("testFile-3-content")
        assertThat(destinationFolder.resolve("testFile-4")).hasContent("")
        assertThat(destinationFolder.resolve("testFile-5")).hasContent("testFile-5-content")
    }

    @Test
    fun singleExceptionLeadsToPartialDownload() {
        val destinationFolder = tempFolder.newFolder().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1"),
            TestData("testFile-2", downloadError = true),
            TestData("testFile-3")
        )

        val countDownLatch = setUpS3Mock(testData, numberOfDownloads = 2)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        retryableAssert { // We delete the file after we get the failure
            assertThat(destinationFolder.resolve("testFile-2")).doesNotExist()
        }
        assertThat(destinationFolder.resolve("testFile-3")).doesNotExist()
    }

    @Test
    fun cancelOnPromptIsSkip() {
        val destinationFolder = tempFolder.newFolder().toPath()
        destinationFolder.resolve("testFile-1").touch()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1")
        )

        TestDialogManager.setTestDialog {
            -1 // Means cancel (esc)
        }

        val countDownLatch = setUpS3Mock(testData, numberOfDownloads = 0)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("")
    }

    @Test
    fun downloadSingleVersionFileToFile() {
        val destinationFile = tempFolder.newFile().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFile)

        val testData = listOf(
            TestData("testFile-1", isVersion = true)
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFile).hasContent("testFile-1-content-old-version")
    }

    @Test
    fun downloadSingleVersionFileToFolder() {
        val destinationFolder = tempFolder.newFolder().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1", isVersion = true)
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1@testVersionId")).hasContent("testFile-1-content-old-version")
    }

    @Test
    fun downloadMixOfVersionedFilesAndNormalFilesToFolder() {
        val destinationFolder = tempFolder.newFolder().toPath()

        createMockFileChooser(testDisposable.disposable, destinationFolder)

        val testData = listOf(
            TestData("testFile-1"),
            TestData("testFile-1", isVersion = true),
            TestData("testFile-2"),
            TestData("testFile-3", isVersion = true)
        )

        val countDownLatch = setUpS3Mock(testData)
        val nodes = testData.convertToNodes()

        sut.executeAction(nodes)

        assertThat(countDownLatch.await(5, TimeUnit.SECONDS)).isTrue
        assertThat(destinationFolder.resolve("testFile-1")).hasContent("testFile-1-content")
        assertThat(destinationFolder.resolve("testFile-1@testVersionId")).hasContent("testFile-1-content-old-version")
        assertThat(destinationFolder.resolve("testFile-2")).hasContent("testFile-2-content")
        assertThat(destinationFolder.resolve("testFile-3@testVersionId")).hasContent("testFile-3-content-old-version")
    }

    private fun setUpConflictResolutionResponses(choices: List<ConflictResolution>, vararg responses: ConflictResolution) {
        var responseNum = 0
        TestDialogManager.setTestDialog {
            choices.indexOf(responses[responseNum++])
        }
    }

    private fun setUpS3Mock(testData: List<TestData>, numberOfDownloads: Int = testData.size): CountDownLatch {
        val countDownLatch = CountDownLatch(numberOfDownloads)

        s3Bucket.stub {
            onBlocking {
                download(any(), any(), anyOrNull(), any())
            }.thenAnswer { invoke ->
                val key = invoke.getArgument<String>(1)

                if (testData.first { it.key == key }.downloadError) {
                    countDownLatch.countDown()
                    throw S3Exception.builder().message("Test Error for $key").build()
                }

                val versionId = invoke.getArgument<String?>(2)

                val contentPostfix = if (versionId != null) "-old-version" else ""
                val content = "$key-content$contentPostfix".toByteArray()

                invoke.getArgument<OutputStream>(3).use {
                    it.write(content)
                }

                countDownLatch.countDown()
            }
        }

        return countDownLatch
    }

    private data class TestData(val key: String, val isVersion: Boolean = false, val downloadError: Boolean = false)

    private fun List<TestData>.convertToNodes(): List<S3TreeNode> {
        val parent = S3TreeDirectoryNode(s3Bucket, null, "")

        return this.map {
            if (it.isVersion) {
                val obj = S3TreeObjectNode(parent, it.key, 1, java.time.Instant.now())
                S3TreeObjectVersionNode(obj, "testVersionId", 1, Instant.now())
            } else {
                S3TreeObjectNode(parent, it.key, 1, Instant.now())
            }
        }
    }
}
