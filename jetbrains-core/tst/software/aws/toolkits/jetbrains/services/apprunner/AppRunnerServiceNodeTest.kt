// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.apprunner.model.ServiceStatus
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AppRunnerExplorerRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import java.util.concurrent.CompletableFuture

class AppRunnerServiceNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun `AppRunner services are listed`() {
        resourceCache.addEntry(
            projectRule.project,
            AppRunnerResources.LIST_SERVICES,
            listOf(
                ServiceSummary.builder().serviceArn("arn1").serviceName("service1").status(ServiceStatus.RUNNING).build(),
                ServiceSummary.builder().serviceArn("arn3").serviceName("service2").status(ServiceStatus.OPERATION_IN_PROGRESS).build()
            )
        )

        val children = AppRunnerNode(projectRule.project, APPRUNNER_EXPLORER_NODE).children

        assertThat(children).allMatch { it is AppRunnerServiceNode }
        assertThat(children.map { it.displayName() }).containsExactlyInAnyOrder("service1", "service2")
        assertThat(children.filterIsInstance<AppRunnerServiceNode>().map { it.resourceArn() }).containsExactlyInAnyOrder("arn1", "arn3")
    }

    @Test
    fun `No services listed`() {
        resourceCache.addEntry(projectRule.project, AppRunnerResources.LIST_SERVICES, listOf())
        val children = AppRunnerNode(projectRule.project, APPRUNNER_EXPLORER_NODE).children
        assertThat(children).singleElement().isInstanceOf(AwsExplorerEmptyNode::class.java)
    }

    @Test
    fun `Error loading repositories`() {
        resourceCache.addEntry(projectRule.project, AppRunnerResources.LIST_SERVICES, CompletableFuture.failedFuture(RuntimeException("network broke")))
        val children = AppRunnerNode(projectRule.project, APPRUNNER_EXPLORER_NODE).children
        assertThat(children).singleElement().isInstanceOf(AwsExplorerErrorNode::class.java)
    }

    private companion object {
        val APPRUNNER_EXPLORER_NODE = AppRunnerExplorerRootNode()
    }
}
