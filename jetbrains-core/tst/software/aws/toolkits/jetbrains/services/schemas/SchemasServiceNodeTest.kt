// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.schemas.model.RegistrySummary
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.SchemasExplorerRootNode
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import java.util.concurrent.CompletableFuture

class SchemasServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun registriesAreShown() {
        val registry1 = "Registry1"
        val registry2 = "aws.events"
        registries(listOf(registry1, registry2))

        val node = SchemasServiceNode(projectRule.project, SCHEMAS_EXPLORER_NODE)

        assertThat(node.children).hasSize(2)

        assertThat(node.children.map { it.displayName() }).contains(registry1, registry2)
    }

    @Test
    fun noRegistriesShowsEmptyNode() {
        registries(emptyList())

        val node = SchemasServiceNode(projectRule.project, SCHEMAS_EXPLORER_NODE)

        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    private fun registries(names: List<String>) {
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.LIST_REGISTRIES,
            CompletableFuture.completedFuture(
                names.map {
                    RegistrySummary.builder()
                        .registryName(it)
                        .build()
                }
            )
        )
    }

    private companion object {
        val SCHEMAS_EXPLORER_NODE = SchemasExplorerRootNode()
    }
}
