// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.redshift.model.Cluster
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.RedshiftExplorerRootNode
import java.util.concurrent.CompletableFuture

class RedshiftExplorerNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun `Redshift resources are listed`() {
        val name = RuleUtils.randomName()
        resourceCache.addEntry(
            projectRule.project,
            RedshiftResources.LIST_CLUSTERS,
            listOf(Cluster.builder().clusterIdentifier(name).build())
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).singleElement().matches {
            it is AwsExplorerNode && it.displayName() == name
        }
    }

    @Test
    fun `No resources makes empty node`() {
        resourceCache.addEntry(projectRule.project, RedshiftResources.LIST_CLUSTERS, listOf())
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).singleElement().isInstanceOf(AwsExplorerEmptyNode::class.java)
    }

    @Test
    fun `Exception thrown makes error node`() {
        resourceCache.addEntry(projectRule.project, RedshiftResources.LIST_CLUSTERS, CompletableFuture.failedFuture(RuntimeException("Simulated error")))
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).singleElement().isInstanceOf(AwsExplorerErrorNode::class.java)
    }

    private companion object {
        val sut = RedshiftExplorerRootNode()
    }
}
