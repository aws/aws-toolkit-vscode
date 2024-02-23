// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.SqsExplorerRootNode
import software.aws.toolkits.jetbrains.services.sqs.resources.SqsResources
import java.util.concurrent.CompletableFuture

class SqsServiceNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun `Sqs queues are listed`() {
        resourceCache.addEntry(
            projectRule.project,
            SqsResources.LIST_QUEUE_URLS,
            listOf(
                "https://sqs.us-east-1.amazonaws.com/123456789012/test2",
                "https://sqs.us-east-1.amazonaws.com/123456789012/test4",
                "https://sqs.us-east-1.amazonaws.com/123456789012/test3",
                "https://sqs.us-east-1.amazonaws.com/123456789012/test1"
            )
        )

        val children = SqsServiceNode(projectRule.project, SQS_EXPLORER_NODE).children

        assertThat(children).allMatch { it is SqsQueueNode }
        assertThat(children.filterIsInstance<SqsQueueNode>().map { it.displayName() }).containsExactlyInAnyOrder("test4", "test3", "test2", "test1")
        assertThat(children.filterIsInstance<SqsQueueNode>().map { it.resourceArn() }).containsExactlyInAnyOrder(
            "arn:aws:sqs:us-east-1:123456789012:test1",
            "arn:aws:sqs:us-east-1:123456789012:test2",
            "arn:aws:sqs:us-east-1:123456789012:test3",
            "arn:aws:sqs:us-east-1:123456789012:test4"
        )
    }

    @Test
    fun `No queues listed`() {
        resourceCache.addEntry(projectRule.project, SqsResources.LIST_QUEUE_URLS, listOf())
        val children = SqsServiceNode(projectRule.project, SQS_EXPLORER_NODE).children
        assertThat(children).singleElement().isInstanceOf(AwsExplorerEmptyNode::class.java)
    }

    @Test
    fun `Error loading queues`() {
        resourceCache.addEntry(projectRule.project, SqsResources.LIST_QUEUE_URLS, CompletableFuture.failedFuture(RuntimeException("Simulated error")))
        val children = SqsServiceNode(projectRule.project, SQS_EXPLORER_NODE).children
        assertThat(children).singleElement().isInstanceOf(AwsExplorerErrorNode::class.java)
    }

    private companion object {
        val SQS_EXPLORER_NODE = SqsExplorerRootNode()
    }
}
