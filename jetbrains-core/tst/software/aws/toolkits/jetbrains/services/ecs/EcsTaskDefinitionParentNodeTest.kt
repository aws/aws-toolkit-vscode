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
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import java.util.concurrent.CompletableFuture

class EcsTaskDefinitionParentNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Before
    fun setUp() {
        resourceCache().clear()
        MockProjectAccountSettingsManager.getInstance(projectRule.project).reset()
    }

    @Test
    fun failedCallShowsErrorNode() {
        val node = aEcsTaskDefinitionParentNode()

        resourceCache().addEntry(
            EcsResources.LIST_ACTIVE_TASK_DEFINITION_FAMILIES,
            CompletableFutureUtils.failedFuture(RuntimeException("Simulated error"))
        )

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerErrorNode::class.java)
    }

    @Test
    fun eachArnGetsANode() {
        val node = aEcsTaskDefinitionParentNode()

        resourceCache().taskDefinitionFamilies("family1", "family1")

        assertThat(node.children).hasSize(2)
        assertThat(node.children).hasOnlyElementsOfType(EcsTaskDefinitionNode::class.java)
    }

    @Test
    fun noClusterShowsEmpty() {
        val node = aEcsTaskDefinitionParentNode()

        resourceCache().taskDefinitionFamilies()

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    private fun aEcsTaskDefinitionParentNode() = EcsTaskDefinitionsParentNode(projectRule.project)

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.taskDefinitionFamilies(vararg familyNames: String) {
        this.addEntry(
            EcsResources.LIST_ACTIVE_TASK_DEFINITION_FAMILIES,
            CompletableFuture.completedFuture(familyNames.toList())
        )
    }
}
