// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CloudWatchRootNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import java.util.concurrent.CompletableFuture

class CloudWatchLogsServiceNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Before
    fun setUp() {
        resourceCache().clear()
    }

    @Test
    fun logGroupsAreListed() {
        resourceCache().logGroups(listOf("bcd", "abc", "zzz", "AEF"))

        val children = CloudWatchLogsServiceNode(projectRule.project, CLOUDWATCH_LOGS_EXPLORER_SERVICE_NODE).children

        assertThat(children).allMatch { it is CloudWatchLogsNode }
        assertThat(children.filterIsInstance<CloudWatchLogsNode>().map { it.displayName() }).containsExactlyInAnyOrder("abc", "AEF", "bcd", "zzz")
    }

    @Test
    fun noLogGroupsShowsEmptyList() {
        resourceCache().logGroups(emptyList())

        val children = CloudWatchLogsServiceNode(projectRule.project, CLOUDWATCH_LOGS_EXPLORER_SERVICE_NODE).children

        assertThat(children).hasSize(1)
        assertThat(children).allMatch { it is AwsExplorerEmptyNode }
    }

    @Test
    fun exceptionLeadsToErrorNode() {
        resourceCache().addEntry(CloudWatchResources.LIST_LOG_GROUPS, CompletableFuture<List<LogGroup>>().also {
            it.completeExceptionally(RuntimeException("Simulated error"))
        })

        val children = CloudWatchLogsServiceNode(projectRule.project, CLOUDWATCH_LOGS_EXPLORER_SERVICE_NODE).children

        assertThat(children).hasSize(1)
        assertThat(children).allMatch { it is AwsExplorerErrorNode }
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.logGroups(names: List<String>) {
        this.addEntry(
            CloudWatchResources.LIST_LOG_GROUPS,
            CompletableFuture.completedFuture(names.map { LogGroup.builder().arn("arn:aws:logs:us-west-2:0123456789:log-group:$it").logGroupName(it).build() })
        )
    }

    private companion object {
        val CLOUDWATCH_LOGS_EXPLORER_SERVICE_NODE = CloudWatchRootNode()
    }
}
