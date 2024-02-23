// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.testFramework.DisposableRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.stub
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeErrorNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import java.awt.datatransfer.DataFlavor
import java.net.URL
import java.time.Instant

class CopyUrlActionTest : ObjectActionTestBase() {
    @Rule
    @JvmField
    val settingsManagerRule = MockAwsConnectionManager.ProjectAccountSettingsManagerRule(projectRule)

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    override val sut = CopyUrlAction()

    @Before
    fun setUpMock() {
        s3Bucket.stub {
            on { generateUrl(any(), anyOrNull()) }.thenAnswer {
                // Actual format is implementation detail below S3VirtualBucket
                URL("https://s3/${it.getArgument<String>(0)}?version=${it.getArgument<String>(1)}")
            }
        }
    }

    @Test
    fun `copy url disabled with no nodes`() {
        assertThat(sut.updateAction(emptyList()).isEnabled).isFalse
    }

    @Test
    fun `copy url disabled with on multiple nodes`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/"),
            S3TreeDirectoryNode(s3Bucket, null, "path2/")
        )
        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy url enabled with on single node`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/"),
        )
        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `copy url enabled with on version nodes`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )

        assertThat(sut.updateAction(nodes).isEnabled).isTrue
    }

    @Test
    fun `copy url action is disabled on error node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeErrorNode(s3Bucket, dir)
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy url action is disabled on continuation node`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeContinuationNode(s3Bucket, dir, "path1/", "marker")
        )

        assertThat(sut.updateAction(nodes).isEnabled).isFalse
    }

    @Test
    fun `copy url for directory is correct`() {
        val nodes = listOf(
            S3TreeDirectoryNode(s3Bucket, null, "path1/"),
        )
        sut.executeAction(nodes)

        val data = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
        assertThat(data).isEqualTo("https://s3/path1/?version=null")
    }

    @Test
    fun `copy url for object is correct`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val nodes = listOf(
            S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        )
        sut.executeAction(nodes)

        val data = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
        assertThat(data).isEqualTo("https://s3/path1/obj1?version=null")
    }

    @Test
    fun `copy url for obj version value is correct`() {
        val dir = S3TreeDirectoryNode(s3Bucket, null, "path1/")
        val obj = S3TreeObjectNode(dir, "path1/obj1", 1, Instant.now())
        val nodes = listOf(
            S3TreeObjectVersionNode(obj, "version", 1, Instant.now())
        )
        sut.executeAction(nodes)

        val data = CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
        assertThat(data).isEqualTo("https://s3/path1/obj1?version=version")
    }
}
