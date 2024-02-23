// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import java.time.Instant

class RefreshTreeActionTest : ObjectActionTestBase() {
    override val sut = RefreshTreeAction()

    @Test
    fun `refresh tree action is enabled on empty selection`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isTrue
    }

    @Test
    fun `refresh tree action is enabled on directory selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `refresh tree action is enabled on object selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `refresh tree action is disabled on object version selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `refresh tree action is disabled on multiple selection`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            dir,
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `refresh tree action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `refresh tree action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `refresh tree on an object`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(obj)

        sut.executeAction(nodes)

        argumentCaptor<S3TreeNode>().apply {
            verify(treeTable).invalidateLevel(capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).isEqualTo(obj)
        }

        verify(treeTable).refresh()
    }

    @Test
    fun `refresh tree on directory`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(dir)

        sut.executeAction(nodes)

        argumentCaptor<S3TreeNode>().apply {
            verify(treeTable).invalidateLevel(capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).isEqualTo(dir)
        }

        verify(treeTable).refresh()
    }

    @Test
    fun `refresh tree with no select uses root`() {
        sut.executeAction(emptyList())

        argumentCaptor<S3TreeNode>().apply {
            verify(treeTable).invalidateLevel(capture())

            assertThat(allValues).hasSize(1)
            assertThat(firstValue).isEqualTo(treeTable.rootNode)
        }

        verify(treeTable).refresh()
    }
}
