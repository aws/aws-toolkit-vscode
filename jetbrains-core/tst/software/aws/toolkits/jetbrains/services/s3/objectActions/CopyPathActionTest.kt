// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.ide.CopyPasteManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import java.awt.datatransfer.DataFlavor
import java.time.Instant

class CopyPathActionTest : ObjectActionTestBase() {
    override val sut = CopyPathAction()

    @Test
    fun `copy path disabled with no nodes`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isFalse
    }

    @Test
    fun `copy path disabled with on multiple nodes`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/"),
            S3TreeDirectoryNode(s3Bucket, null, "path2/")
        )
        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy path enabled with on single node`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/"),
        )
        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `copy path disabled with on version nodes`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy path action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy path action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy path for directory is correct`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/"),
        )
        sut.executeAction(nodes)

        val data = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
        assertThat(data).isEqualTo("path1/")
    }

    @Test
    fun `copy path for object is correct`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )
        sut.executeAction(nodes)

        val data = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
        assertThat(data).isEqualTo("path1/obj1")
    }
}
