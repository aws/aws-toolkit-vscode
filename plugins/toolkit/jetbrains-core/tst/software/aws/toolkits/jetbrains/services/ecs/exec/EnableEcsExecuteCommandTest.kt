// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import java.util.concurrent.CompletableFuture

class EnableEcsExecuteCommandTest {
    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun `Enable Command Execution action is not visible if enableExecuteCommand flag is true`() {
        val clusterArn = "arn:aws:ecs:us-east-1:123456789012:cluster/cluster-name"
        val serviceArn = "arn:aws:ecs:us-east-1:123456789012:service/service-name"

        val ecsService = Service.builder()
            .clusterArn(clusterArn)
            .serviceArn(serviceArn)
            .enableExecuteCommand(true)
            .serviceName("service-name")
            .build()

        resourceCache.addEntry(
            projectRule.project,
            EcsResources.describeService(clusterArn, serviceArn),
            CompletableFuture.completedFuture(ecsService)
        )

        val sut = EnableEcsExecuteCommand()
        val node = listOf(EcsServiceNode(projectRule.project, ecsService, clusterArn))
        val actionVisibility = sut.updateAction(node).isVisible
        assertThat(actionVisibility).isFalse
    }

    fun AnAction.updateAction(node: List<EcsServiceNode>): Presentation {
        val event = createEventFor(this, node)
        update(event)
        return event.presentation
    }
    private fun createEventFor(action: AnAction, node: List<EcsServiceNode>): AnActionEvent {
        val projectContext = SimpleDataContext.getProjectContext(projectRule.project)
        val dataContext = SimpleDataContext.builder()
            .setParent(projectContext)
            .add(ExplorerDataKeys.SELECTED_NODES, node)
            .build()

        return AnActionEvent.createFromAnAction(action, null, ActionPlaces.UNKNOWN, dataContext)
    }
}
