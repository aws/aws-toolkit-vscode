// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.redshift.model.Cluster
import software.amazon.awssdk.utils.CompletableFutureUtils
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.RedshiftExplorerRootNode

class RedshiftExplorerNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule(projectRule)

    @Test
    fun `Redshift resources are listed`() {
        val name = RuleUtils.randomName()
        resourceCache.get().addEntry(
            RedshiftResources.LIST_CLUSTERS, listOf(Cluster.builder().clusterIdentifier(name).build())
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).hasOnlyOneElementSatisfying {
            it.displayName() == name
        }
    }

    @Test
    fun `No resources makes empty node`() {
        resourceCache.get().addEntry(RedshiftResources.LIST_CLUSTERS, listOf())
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).hasOnlyOneElementSatisfying {
            it is AwsExplorerEmptyNode
        }
    }

    @Test
    fun `Exception thrown makes error node`() {
        resourceCache.get().addEntry(RedshiftResources.LIST_CLUSTERS, CompletableFutureUtils.failedFuture(RuntimeException("Simulated error")))
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).hasOnlyOneElementSatisfying {
            it is AwsExplorerErrorNode
        }
    }

    private companion object {
        val sut = RedshiftExplorerRootNode()
    }
}
