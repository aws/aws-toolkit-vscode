// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserDialog
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyBlocking
import software.amazon.awssdk.services.s3.model.S3Exception
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import java.io.File
import java.time.Instant

class UploadObjectActionTest : ObjectActionTestBase() {
    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    override val sut = UploadObjectAction()

    @Test
    fun `upload object action is enabled on empty selection`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isTrue
    }

    @Test
    fun `upload object action is enabled on directory selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `upload object action is enabled on object selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `upload object action is disabled on object version selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `upload object action is disabled on multiple selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            dir,
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `upload action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `upload action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `upload object action does nothing when no files selected`() {
        createFileChooserMock(emptyList())

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        retryableAssert {
            verifyBlocking(s3Bucket, never()) {
                upload(any(), any(), any())
            }
            verify(treeTable, never()).invalidateLevel(any())
            verify(treeTable, never()).refresh()
        }
    }

    @Test
    fun `upload object action works for a single file`() {
        val newFile = tempFolder.newFile()
        createFileChooserMock(listOf(newFile))

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        retryableAssert {
            argumentCaptor<String>().apply {
                verifyBlocking(s3Bucket) { upload(any(), any(), capture()) }

                assertThat(allValues).hasSize(1)
                assertThat(firstValue).isEqualTo("path1/${newFile.name}")
            }

            verify(treeTable).invalidateLevel(dir)
            verify(treeTable).refresh()
        }
    }

    @Test
    fun `upload object action works for multiple files`() {
        val newFile = tempFolder.newFile()
        val newFile2 = tempFolder.newFile()
        createFileChooserMock(listOf(newFile, newFile2))

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        retryableAssert {
            argumentCaptor<String>().apply {
                verifyBlocking(s3Bucket, times(2)) { upload(any(), any(), capture()) }

                assertThat(firstValue).isEqualTo("path1/${newFile.name}")
                assertThat(secondValue).isEqualTo("path1/${newFile2.name}")
            }

            verify(treeTable).invalidateLevel(dir)
            verify(treeTable).refresh()
        }
    }

    @Test
    fun `upload object action skips on a folder`() {
        val newFile = tempFolder.newFile()
        val newFolder = tempFolder.newFolder()
        val newFile2 = tempFolder.newFile()
        createFileChooserMock(listOf(newFile, newFolder, newFile2))

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        retryableAssert {
            argumentCaptor<String>().apply {
                verifyBlocking(s3Bucket, times(2)) { upload(any(), any(), capture()) }

                assertThat(firstValue).isEqualTo("path1/${newFile.name}")
                assertThat(secondValue).isEqualTo("path1/${newFile2.name}")
            }
            verify(treeTable).invalidateLevel(dir)
            verify(treeTable).refresh()
        }
    }

    @Test
    fun `upload object action aborts on an error`() {
        val newFile = tempFolder.newFile()
        val newFile2 = tempFolder.newFile()
        val newFile3 = tempFolder.newFile()
        createFileChooserMock(listOf(newFile, newFile2, newFile3))

        s3Bucket.stub {
            onBlocking {
                upload(any(), any(), any())
            }.thenReturn(null).thenThrow(S3Exception.builder().message("Test exception").build())
        }

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        retryableAssert {
            argumentCaptor<String>().apply {
                verifyBlocking(s3Bucket, times(2)) { upload(any(), any(), capture()) }

                assertThat(firstValue).isEqualTo("path1/${newFile.name}")
            }
            verify(treeTable).invalidateLevel(dir)
            verify(treeTable).refresh()
        }
    }

    @Test
    fun `upload object action doesn't refresh if nothing changed`() {
        val newFolder = tempFolder.newFolder()
        createFileChooserMock(listOf(newFolder))

        s3Bucket.stub {
            onBlocking {
                upload(any(), any(), any())
            }.thenReturn(null).thenThrow(S3Exception.builder().message("Test exception").build())
        }

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        retryableAssert {
            verifyBlocking(s3Bucket, never()) { upload(any(), any(), any()) }
            verify(treeTable, never()).invalidateLevel(dir)
            verify(treeTable, never()).refresh()
        }
    }

    @Test
    fun `upload object action with no selection uploads to root`() {
        val newFile = tempFolder.newFile()
        createFileChooserMock(listOf(newFile))

        sut.executeAction(emptyList())

        retryableAssert {
            argumentCaptor<String>().apply {
                verifyBlocking(s3Bucket) { upload(any(), any(), capture()) }

                assertThat(allValues).hasSize(1)
                assertThat(firstValue).isEqualTo(newFile.name)
            }

            verify(treeTable).invalidateLevel(treeTable.rootNode)
            verify(treeTable).refresh()
        }
    }

    private fun createFileChooserMock(files: List<File>) {
        val dialog = object : FileChooserDialog {
            @Deprecated("needs to be implemented, but interface doesn't provide default impl")
            override fun choose(toSelect: VirtualFile?, project: Project?): Array<VirtualFile> = toSelect?.let {
                choose(project, it)
            } ?: choose(project)

            override fun choose(project: Project?, vararg toSelect: VirtualFile): Array<VirtualFile> {
                val lfs = LocalFileSystem.getInstance()
                return files.mapNotNull {
                    lfs.refreshAndFindFileByIoFile(it)
                }.toTypedArray()
            }
        }

        val mock = mock<FileChooserFactory> {
            on { createFileChooser(any(), anyOrNull(), anyOrNull()) }.thenReturn(dialog)
        }

        ApplicationManager.getApplication().replaceService(FileChooserFactory::class.java, mock, disposableRule.disposable)
    }
}
