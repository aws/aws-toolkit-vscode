// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import java.util.concurrent.CompletableFuture

class EcsClusterNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val clusterArn = "arn:aws:ecs:us-west-2:1234567890:cluster/clusterName"

    @Test
    fun arnIsParsedIntoGoodName() {
        val node = aEcsClusterNode(clusterArn)

        assertThat(node.displayName()).isEqualTo("clusterName")
    }

    @Test
    fun invalidArnFormatDoesntBreakDisplay() {
        val badClusterArn = "arn:aws:ecs:us-west-2:1234567890:clusterArnIsIncorrect/clusterName"
        val node = aEcsClusterNode(badClusterArn)

        assertThat(node.displayName()).isEqualTo(badClusterArn)
    }

    @Test
    fun failedCallShowsErrorNode() {
        val node = aEcsClusterNode()

        resourceCache.addEntry(
            projectRule.project,
            EcsResources.listServiceArns(clusterArn),
            CompletableFuture.failedFuture(RuntimeException("Simulated error"))
        )

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerErrorNode::class.java)
    }

    @Test
    fun eachServiceArnGetsANode() {
        val node = aEcsClusterNode()

        mockServiceArns("arn1", "arn2")
        mockService("arn1", Service.builder().build())
        mockService("arn2", Service.builder().build())

        assertThat(node.children).hasSize(2)
        assertThat(node.children).hasOnlyElementsOfType(EcsServiceNode::class.java)
    }

    @Test
    fun noServicesShowsEmpty() {
        val node = aEcsClusterNode()

        mockServiceArns()

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    private fun aEcsClusterNode(arn: String = clusterArn) = EcsClusterNode(projectRule.project, arn)

    private fun mockServiceArns(vararg arns: String) {
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.listServiceArns(clusterArn),
            CompletableFuture.completedFuture(arns.toList())
        )
    }

    private fun mockService(serviceArn: String, service: Service) {
        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeService(clusterArn, serviceArn),
            CompletableFuture.completedFuture(service)
        )
    }
}
