// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.schemas.model.RegistrySummary
import software.amazon.awssdk.services.schemas.model.SchemaSummary
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import java.util.concurrent.CompletableFuture

class SchemaRegistryNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun showRegistrySchemas() {
        val registry = "aws.events"
        val node = aSchemaRegistryNode(registry)

        val schema1 = "schema1"
        val schema2 = "schema2"
        registryWithSchemas(
            registry,
            listOf(
                schema1,
                schema2
            )
        )

        assertThat(node.children).hasSize(2)
        assertThat(node.children).hasOnlyElementsOfType(SchemaNode::class.java)

        assertThat(node.children.map { it.displayName() }).contains(schema1, schema2)
    }

    private fun aSchemaRegistryNode(registry: String) = SchemaRegistryNode(projectRule.project, RegistrySummary.builder().registryName(registry).build())

    private fun registryWithSchemas(registryName: String, schemas: List<String>) {
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.listSchemas(registryName),
            CompletableFuture.completedFuture(
                schemas.map {
                    SchemaSummary.builder()
                        .schemaName(it)
                        .build()
                }
            )
        )
    }
}
