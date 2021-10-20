// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudcontrol.model.UnsupportedActionException
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.core.utils.test.hasOnlyOneElementOfType
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.services.dynamic.CloudControlApiResources
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.ResourceType
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class DynamicResourceResourceTypeNodeTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    @Test
    fun returnsListFromProvider() {
        val type = aString()
        val identifier = aString()
        val resources = listOf(DynamicResource(ResourceType(type, "foo", "bah"), identifier))
        resourceCache.addEntry(projectRule.project, CloudControlApiResources.listResources(type), resources)

        val sut = DynamicResourceResourceTypeNode(projectRule.project, type)

        assertThat(sut.children).hasOnlyOneElementOfType<DynamicResourceNode>().satisfies {
            assertThat(it.displayName()).isEqualTo(identifier)
        }
    }

    @Test
    fun unsupportedExceptionResultsInEmptyNode() {
        val type = aString()
        resourceCache.addEntry(
            projectRule.project,
            CloudControlApiResources.listResources(type),
            CompletableFuture.failedFuture(UnsupportedActionException.builder().build())
        )

        val sut = DynamicResourceResourceTypeNode(projectRule.project, type)

        assertThat(sut.children).hasOnlyOneElementOfType<AwsExplorerEmptyNode>().satisfies {
            assertThat(it.displayName()).startsWith(message("dynamic_resources.unavailable_in_region", ""))
        }
    }

    @Test
    fun otherExceptionsBubble() {
        val type = aString()
        resourceCache.addEntry(projectRule.project, CloudControlApiResources.listResources(type), CompletableFuture.failedFuture(RuntimeException()))

        val sut = DynamicResourceResourceTypeNode(projectRule.project, type)

        assertThat(sut.children).hasOnlyOneElementOfType<AwsExplorerErrorNode>()
    }
}
