// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.utils.CompletableFutureUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.EcrExplorerRootNode
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository

class EcrServiceNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun `Ecr repositories are listed`() {
        resourceCache.addEntry(
            projectRule.project,
            EcrResources.LIST_REPOS,
            listOf(
                Repository("repo1", "arn3", ""),
                Repository("repo2", "arn2", "")
            )
        )

        val children = EcrServiceNode(projectRule.project, ECR_EXPLORER_NODE).children

        assertThat(children).allMatch { it is EcrRepositoryNode }
        assertThat(children.map { it.displayName() }).containsExactlyInAnyOrder("repo1", "repo2")
        assertThat(children.filterIsInstance<EcrRepositoryNode>().map { it.resourceArn() }).containsExactlyInAnyOrder("arn2", "arn3")
    }

    @Test
    fun `No repositories listed`() {
        resourceCache.addEntry(projectRule.project, EcrResources.LIST_REPOS, listOf())
        val children = EcrServiceNode(projectRule.project, ECR_EXPLORER_NODE).children
        assertThat(children).hasOnlyOneElementSatisfying { it is AwsExplorerEmptyNode }
    }

    @Test
    fun `Error loading repositories`() {
        resourceCache.addEntry(projectRule.project, EcrResources.LIST_REPOS, CompletableFutureUtils.failedFuture(RuntimeException("network broke")))
        val children = EcrServiceNode(projectRule.project, ECR_EXPLORER_NODE).children
        assertThat(children).hasOnlyOneElementSatisfying { it is AwsExplorerErrorNode }
    }

    private companion object {
        val ECR_EXPLORER_NODE = EcrExplorerRootNode()
    }
}
