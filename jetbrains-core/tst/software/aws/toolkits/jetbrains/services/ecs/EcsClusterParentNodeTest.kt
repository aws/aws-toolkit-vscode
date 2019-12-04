// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.utils.CompletableFutureUtils
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import java.util.concurrent.CompletableFuture

class EcsClusterParentNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Before
    fun setUp() {
        resourceCache().clear()
    }

    @Test
    fun failedCallShowsErrorNode() {
        val node = aEcsClusterParentNode()

        resourceCache().addEntry(
            EcsResources.LIST_CLUSTER_ARNS,
            CompletableFutureUtils.failedFuture(RuntimeException("Simulated error"))
        )

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerErrorNode::class.java)
    }

    @Test
    fun eachArnGetsANode() {
        val node = aEcsClusterParentNode()

        resourceCache().clusterArns("arn1", "arn2")

        assertThat(node.children).hasSize(2)
        assertThat(node.children).hasOnlyElementsOfType(EcsClusterNode::class.java)
    }

    @Test
    fun noClusterShowsEmpty() {
        val node = aEcsClusterParentNode()

        resourceCache().clusterArns()

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    private fun aEcsClusterParentNode() = EcsClusterParentNode(projectRule.project)

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.clusterArns(vararg arns: String) {
        this.addEntry(
            EcsResources.LIST_CLUSTER_ARNS,
            CompletableFuture.completedFuture(arns.toList())
        )
    }
}
