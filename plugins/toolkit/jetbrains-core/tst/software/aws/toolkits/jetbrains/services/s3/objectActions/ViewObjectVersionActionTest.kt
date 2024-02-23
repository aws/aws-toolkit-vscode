// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import java.time.Instant

class ViewObjectVersionActionTest : ObjectActionTestBase() {
    override val sut = ViewObjectVersionAction()

    @Test
    fun `show history is disabled on empty selection`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isFalse
    }

    @Test
    fun `show history is disabled on directory selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `show history is enabled on object selection`() {
        val dirNode = S3TreeDirectoryNode(s3Bucket, null, "")
        val nodes = listOf(
            S3TreeObjectNode(dirNode, "testKey", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `show history is disabled on object version selection`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `show history is disabled on multiple selection`() {
        val dirNode = S3TreeDirectoryNode(s3Bucket, null, "")
        val nodes = listOf(
            S3TreeObjectNode(dirNode, "testKey2", 1, Instant.now()),
            S3TreeObjectNode(dirNode, "testKey", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `show history action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `show history action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `show object history on object node`() {
        val dirNode = S3TreeDirectoryNode(s3Bucket, null, "")
        val objectNode = S3TreeObjectNode(dirNode, "testKey", 1, Instant.now())

        assertThat(objectNode.showHistory).isFalse

        sut.executeAction(listOf(objectNode))

        assertThat(objectNode.showHistory).isTrue
        verify(treeTable).refresh()
    }
}
