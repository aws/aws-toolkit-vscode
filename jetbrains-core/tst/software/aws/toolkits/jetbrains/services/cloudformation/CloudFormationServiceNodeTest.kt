// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.CloudFormationExplorerRootNode
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import java.util.concurrent.CompletableFuture

class CloudFormationServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun completedStacksAreShown() {
        stacksWithNames(listOf("Stack" to StackStatus.CREATE_COMPLETE))

        val node = CloudFormationServiceNode(projectRule.project, CF_EXPLORER_NODE)

        assertThat(node.children).singleElement().matches { it.displayName() == "Stack" }
    }

    @Test
    fun noStacksShowsEmptyNode() {
        stacksWithNames(emptyList())

        val node = CloudFormationServiceNode(projectRule.project, CF_EXPLORER_NODE)

        assertThat(node.children).singleElement().isInstanceOf(AwsExplorerEmptyNode::class.java)
    }

    private fun stacksWithNames(names: List<Pair<String, StackStatus>>) {
        resourceCache.addEntry(
            projectRule.project,
            CloudFormationResources.ACTIVE_STACKS,
            CompletableFuture.completedFuture(
                names.map {
                    StackSummary.builder()
                        .stackName(it.first)
                        .stackId(it.first)
                        .stackStatus(it.second)
                        .build()
                }
            )
        )
    }

    private companion object {
        val CF_EXPLORER_NODE = CloudFormationExplorerRootNode()
    }
}
