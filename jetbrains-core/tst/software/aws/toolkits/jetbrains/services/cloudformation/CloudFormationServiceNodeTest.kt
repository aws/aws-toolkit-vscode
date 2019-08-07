// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import java.util.concurrent.CompletableFuture

class CloudFormationServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Before
    fun setUp() {
        resourceCache().clear()
    }

    @Test
    fun completedStacksAreShown() {
        resourceCache().stacksWithNames(listOf("Stack" to StackStatus.CREATE_COMPLETE))

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasOnlyOneElementSatisfying { assertThat(it.displayName()).isEqualTo("Stack") }
    }

    @Test
    fun deletedStacksAreNotShown() {
        resourceCache().stacksWithNames(listOf("Stack" to StackStatus.DELETE_COMPLETE))

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    @Test
    fun noStacksShowsEmptyNode() {
        resourceCache().stacksWithNames(emptyList())

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.stacksWithNames(names: List<Pair<String, StackStatus>>) {
        this.addEntry(
            CloudFormationResources.LIST_STACKS,
            CompletableFuture.completedFuture(
                names.map {
                    StackSummary.builder()
                        .stackName(it.first)
                        .stackId(it.first)
                        .stackStatus(it.second)
                        .build()
                }
            ))
    }
}