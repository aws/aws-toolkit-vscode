// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.anyOrNull
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse
import software.amazon.awssdk.services.s3.model.ObjectVersion
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import java.time.Instant

class ViewObjectVersionActionTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun showObjectHistoryOnObjectNode() {
        val bucket = setUpVirtualBucket(emptyList())
        val dirNode = S3TreeDirectoryNode(bucket, null, "")
        val objectNode = S3TreeObjectNode(dirNode, "testKey", 1, Instant.now())
        val s3TreeTable = setUpS3TreeTable(objectNode)
        val showHistoryFlagBeforeAction = objectNode.showHistory
        val nodeChildrenBeforeAction = objectNode.children
        val viewObjectVersionAction = ViewObjectVersionAction(s3TreeTable)

        viewObjectVersionAction.actionPerformed(TestActionEvent { projectRule.project })

        val showHistoryFlagAfterAction = objectNode.showHistory

        assertThat(showHistoryFlagBeforeAction).isFalse()
        assertThat(showHistoryFlagAfterAction).isTrue()
        assertThat(nodeChildrenBeforeAction).isEmpty()
        verify(s3TreeTable, times(1)).refresh()
    }

    @Test
    fun populateChildrenOnShowObjectHistoryAction() {
        val testKey = "testKey"
        val testObjectVersion1 = ObjectVersion.builder().size(111).key(testKey).versionId("testVersionKey").lastModified(Instant.MIN).build()
        val testObjectVersion2 = ObjectVersion.builder().size(222).key(testKey).versionId("testVersionKey2").lastModified(Instant.now()).build()
        val bucket = setUpVirtualBucket(listOf(testObjectVersion1, testObjectVersion2))
        val dirNode = S3TreeDirectoryNode(bucket, null, "")
        val objectNode = S3TreeObjectNode(dirNode, testKey, 1, Instant.now())
        val viewObjectVersionAction = ViewObjectVersionAction(setUpS3TreeTable(objectNode))

        val nodeChildrenBeforeAction = objectNode.children

        viewObjectVersionAction.actionPerformed(TestActionEvent { projectRule.project })

        val nodeChildrenAfterAction = objectNode.children

        assertThat(nodeChildrenBeforeAction).isEmpty()
        assertThat(nodeChildrenAfterAction.size).isEqualTo(2)
        assertThat(nodeChildrenAfterAction[0]).isInstanceOf(S3TreeObjectVersionNode::class.java)
        assertThat(nodeChildrenAfterAction[1]).isInstanceOf(S3TreeObjectVersionNode::class.java)
        assertThat(nodeChildrenAfterAction[0].key).isEqualTo(testKey)
        assertThat(nodeChildrenAfterAction[1].key).isEqualTo(testKey)

        assertNodeEqualToObjectVersionResponse(nodeChildrenAfterAction[0] as S3TreeObjectVersionNode, testObjectVersion1)
        assertNodeEqualToObjectVersionResponse(nodeChildrenAfterAction[1] as S3TreeObjectVersionNode, testObjectVersion2)
    }

    private fun assertNodeEqualToObjectVersionResponse(node: S3TreeObjectVersionNode, objectVersion: ObjectVersion) {
        assertThat(node.size).isEqualTo(objectVersion.size())
        assertThat(node.versionId).isEqualTo(objectVersion.versionId())
        assertThat(node.lastModified).isEqualTo(objectVersion.lastModified())
    }

    private fun setUpS3TreeTable(objectNode: S3TreeObjectNode): S3TreeTable =
        mock {
            on { getSelectedNodes() }.thenReturn(listOf(objectNode))
        }

    private fun setUpVirtualBucket(objectVersions: List<ObjectVersion>): S3VirtualBucket =
        mock {
            onBlocking { listObjectVersions(any(), anyOrNull(), anyOrNull()) }.thenReturn(ListObjectVersionsResponse.builder().versions(objectVersions).build())

            on { name }.thenReturn("testBucket")
        }
}
