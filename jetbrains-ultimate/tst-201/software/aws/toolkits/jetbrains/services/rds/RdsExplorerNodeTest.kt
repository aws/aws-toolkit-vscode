// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.rds.model.DBInstance
import software.amazon.awssdk.utils.CompletableFutureUtils
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.RdsExplorerRootNode
import software.aws.toolkits.resources.message

class RdsExplorerNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule(projectRule)

    @Test
    fun mySqlResourcesAreListed() {
        val name = RuleUtils.randomName()
        val name2 = RuleUtils.randomName()
        resourceCache.get().addEntry(
            RdsResources.LIST_INSTANCES_MYSQL, listOf(
                DBInstance.builder().engine(mysqlEngineType).dbName(name).dbInstanceArn("").build(),
                DBInstance.builder().engine(mysqlEngineType).dbName(name2).dbInstanceArn("").build()
            )
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).anyMatch { it.displayName() == message("rds.mysql") }
        val mySqlNode = serviceRootNode.children.first { it.displayName() == message("rds.mysql") }
        assertThat(mySqlNode.children).hasSize(2)
        assertThat(mySqlNode.children).anyMatch {
            (it as RdsNode).dbInstance.dbName() == name
        }
        assertThat(mySqlNode.children).anyMatch {
            (it as RdsNode).dbInstance.dbName() == name2
        }
    }

    @Test
    fun postgreSqlResourcesAreListed() {
        val name = RuleUtils.randomName()
        val name2 = RuleUtils.randomName()
        resourceCache.get().addEntry(
            RdsResources.LIST_INSTANCES_POSTGRES, listOf(
                DBInstance.builder().engine(postgresEngineType).dbName(name).dbInstanceArn("").build(),
                DBInstance.builder().engine(postgresEngineType).dbName(name2).dbInstanceArn("").build()
            )
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).anyMatch { it.displayName() == message("rds.postgres") }
        val mySqlNode = serviceRootNode.children.first { it.displayName() == message("rds.postgres") }
        assertThat(mySqlNode.children).hasSize(2)
        assertThat(mySqlNode.children).anyMatch {
            (it as RdsNode).dbInstance.dbName() == name
        }
        assertThat(mySqlNode.children).anyMatch {
            (it as RdsNode).dbInstance.dbName() == name2
        }
    }

    @Test
    fun noResourcesEmptyNodes() {
        resourceCache.get().addEntry(RdsResources.LIST_INSTANCES_MYSQL, listOf())
        resourceCache.get().addEntry(RdsResources.LIST_INSTANCES_POSTGRES, listOf())
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).isNotEmpty
        serviceRootNode.children.forEach { node ->
            assertThat(node.children).hasOnlyOneElementSatisfying { it is AwsExplorerEmptyNode }
        }
    }

    @Test
    fun exceptionMakesErrorNodes() {
        resourceCache.get().addEntry(RdsResources.LIST_INSTANCES_MYSQL, CompletableFutureUtils.failedFuture(RuntimeException("Simulated error")))
        resourceCache.get().addEntry(RdsResources.LIST_INSTANCES_POSTGRES, CompletableFutureUtils.failedFuture(RuntimeException("Simulated error")))
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).isNotEmpty
        serviceRootNode.children.forEach { node ->
            assertThat(node.children).hasOnlyOneElementSatisfying { it is AwsExplorerErrorNode }
        }
    }

    private companion object {
        val sut = RdsExplorerRootNode()
    }
}
