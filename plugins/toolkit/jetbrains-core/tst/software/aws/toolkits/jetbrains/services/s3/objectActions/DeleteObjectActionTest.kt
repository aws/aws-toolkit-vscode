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
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyBlocking
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import java.time.Instant

class DeleteObjectActionTest : ObjectActionTestBase() {
    override val sut = DeleteObjectAction()

    @After
    fun tearDown() {
        TestDialogManager.setTestDialog(TestDialog.DEFAULT)
    }

    @Test
    fun `delete action is disabled on empty selection`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isFalse
    }

    @Test
    fun `delete action is disabled on directory selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `delete action is enabled on object selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now()),
            S3TreeObjectNode(dir, "path1/obj2", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `delete action is disabled on object version selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `delete action is disabled on mix of object and directory selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            dir,
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `delete action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `delete action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `delete denied confirmation is no-op`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        TestDialogManager.setTestDialog(TestDialog.NO)

        sut.executeAction(nodes)

        verifyBlocking(s3Bucket, never()) {
            deleteObjects(any())
        }
    }

    @Test
    fun `delete confirmation cancelled is no-op`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        TestDialogManager.setTestDialog {
            -1 // means cancel
        }

        sut.executeAction(nodes)

        verifyBlocking(s3Bucket, never()) {
            deleteObjects(any())
        }
    }

    @Test
    fun `delete confirmed confirmation deletes file`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now()),
            S3TreeObjectNode(dir, "path1/obj2", 1, Instant.now()),
            S3TreeObjectNode(dir, "path1/obj3", 1, Instant.now()),
        )

        TestDialogManager.setTestDialog(TestDialog.OK)

        sut.executeAction(nodes)

        retryableAssert {
            argumentCaptor<List<String>>().apply {
                verifyBlocking(s3Bucket) { deleteObjects(capture()) }

                assertThat(allValues).hasSize(1)
                assertThat(firstValue).containsAll(nodes.map { it.key })
            }

            // Happens async on a different thread
            retryableAssert {
                verify(treeTable, times(3)).invalidateLevel(any<S3TreeObjectNode>())
                verify(treeTable).refresh()
            }
        }
    }
}
