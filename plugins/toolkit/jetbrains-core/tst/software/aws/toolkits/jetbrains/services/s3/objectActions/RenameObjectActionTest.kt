// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.ui.TestDialog
import com.intellij.openapi.ui.TestDialogManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyBlocking
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import java.time.Instant

class RenameObjectActionTest : ObjectActionTestBase() {
    override val sut = RenameObjectAction()

    @After
    fun tearDown() {
        TestDialogManager.setTestDialog(TestDialog.DEFAULT)
    }

    @Test
    fun `rename object action is disabled on empty selection`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isFalse
    }

    @Test
    fun `rename object action is disabled on directory selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `rename object action is enabled on object selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `rename object action is disabled on object version selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `rename object action is disabled on multiple selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            dir,
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `rename action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `rename action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `rename object action works`() {
        val input = aString()
        TestDialogManager.setTestInputDialog { input }

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(obj)

        sut.executeAction(nodes)

        retryableAssert {
            argumentCaptor<String>().apply {
                verifyBlocking(s3Bucket) { renameObject(capture(), capture()) }

                assertThat(allValues).hasSize(2)
                assertThat(firstValue).isEqualTo("path1/obj1")
                assertThat(secondValue).isEqualTo("path1/$input")
            }

            verify(treeTable).invalidateLevel(obj)
            verify(treeTable).refresh()
        }
    }

    @Test
    fun `rename object action can be cancelled`() {
        TestDialogManager.setTestInputDialog { null }

        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        sut.executeAction(nodes)

        verifyBlocking(s3Bucket, never()) { renameObject(any(), any()) }
        verify(treeTable, never()).invalidateLevel(any())
        verify(treeTable, never()).refresh()
    }
}
