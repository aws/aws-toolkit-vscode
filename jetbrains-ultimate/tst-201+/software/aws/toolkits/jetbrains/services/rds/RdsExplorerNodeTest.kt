// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.rds.model.DBInstance
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.RdsExplorerRootNode
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class RdsExplorerNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun `MySQL resources are listed`() {
        val name = RuleUtils.randomName()
        val name2 = RuleUtils.randomName()
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_MYSQL,
            listOf(
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
    fun `Aurora MySQL resources are listed`() {
        val name = RuleUtils.randomName()
        val name2 = RuleUtils.randomName()
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_AURORA_MYSQL,
            listOf(
                DBInstance.builder().engine(auroraMysqlEngineType).dbName(name).dbInstanceArn("").build(),
                DBInstance.builder().engine(auroraMysqlEngineType).dbName(name2).dbInstanceArn("").build()
            )
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).anyMatch { it.displayName() == message("rds.aurora") }
        val auroraNode = serviceRootNode.children.first { it.displayName() == message("rds.aurora") }
        assertThat(auroraNode).isInstanceOf(AuroraParentNode::class.java)
        assertThat(auroraNode.children).hasSize(2)
        val mysqlNode = (auroraNode as AuroraParentNode).children.first { it.displayName() == message("rds.mysql") }
        assertThat(mysqlNode.children).hasSize(2)
        assertThat(mysqlNode.children).anyMatch { (it as RdsNode).dbInstance.dbName() == name }
        assertThat(mysqlNode.children).anyMatch { (it as RdsNode).dbInstance.dbName() == name2 }
    }

    @Test
    fun `PostgreSQL resources are listed`() {
        val name = RuleUtils.randomName()
        val name2 = RuleUtils.randomName()
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_POSTGRES,
            listOf(
                DBInstance.builder().engine(postgresEngineType).dbName(name).dbInstanceArn("").build(),
                DBInstance.builder().engine(postgresEngineType).dbName(name2).dbInstanceArn("").build()
            )
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).anyMatch { it.displayName() == message("rds.postgres") }
        val postgresNode = serviceRootNode.children.first { it.displayName() == message("rds.postgres") }
        assertThat(postgresNode.children).hasSize(2)
        assertThat(postgresNode.children).anyMatch { (it as RdsNode).dbInstance.dbName() == name }
        assertThat(postgresNode.children).anyMatch { (it as RdsNode).dbInstance.dbName() == name2 }
    }

    @Test
    fun `Aurora PostgreSQL resources are listed`() {
        val name = RuleUtils.randomName()
        val name2 = RuleUtils.randomName()
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_AURORA_POSTGRES,
            listOf(
                DBInstance.builder().engine(auroraPostgresEngineType).dbName(name).dbInstanceArn("").build(),
                DBInstance.builder().engine(auroraPostgresEngineType).dbName(name2).dbInstanceArn("").build()
            )
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).anyMatch { it.displayName() == message("rds.aurora") }
        val auroraNode = serviceRootNode.children.first { it.displayName() == message("rds.aurora") }
        assertThat(auroraNode).isInstanceOf(AuroraParentNode::class.java)
        assertThat(auroraNode.children).hasSize(2)
        val postgresNode = (auroraNode as AuroraParentNode).children.first { it.displayName() == message("rds.postgres") }
        assertThat(postgresNode.children).hasSize(2)
        assertThat(postgresNode.children).anyMatch { (it as RdsNode).dbInstance.dbName() == name }
        assertThat(postgresNode.children).anyMatch { (it as RdsNode).dbInstance.dbName() == name2 }
    }

    @Test
    fun `No resources leads to empty nodes`() {
        resourceCache.addEntry(projectRule.project, RdsResources.LIST_INSTANCES_MYSQL, listOf())
        resourceCache.addEntry(projectRule.project, RdsResources.LIST_INSTANCES_POSTGRES, listOf())
        resourceCache.addEntry(projectRule.project, RdsResources.LIST_INSTANCES_AURORA_MYSQL, listOf())
        resourceCache.addEntry(projectRule.project, RdsResources.LIST_INSTANCES_AURORA_POSTGRES, listOf())
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).isNotEmpty
        serviceRootNode.children.forEach { node ->
            if (node is AuroraParentNode) {
                node.children.forEach {
                    assertThat(it.children).hasOnlyOneElementSatisfying { it is AwsExplorerEmptyNode }
                }
            } else {
                assertThat(node.children).hasOnlyOneElementSatisfying { it is AwsExplorerEmptyNode }
            }
        }
    }

    @Test
    fun `Exception makes error nodes`() {
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_MYSQL,
            CompletableFuture.failedFuture(RuntimeException("Simulated error"))
        )
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_POSTGRES,
            CompletableFuture.failedFuture(RuntimeException("Simulated error"))
        )
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_AURORA_MYSQL,
            CompletableFuture.failedFuture(RuntimeException("Simulated error"))
        )
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_INSTANCES_AURORA_POSTGRES,
            CompletableFuture.failedFuture(RuntimeException("Simulated error"))
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).isNotEmpty
        serviceRootNode.children.forEach { node ->
            if (node is AuroraParentNode) {
                node.children.forEach {
                    assertThat(it.children).hasOnlyOneElementSatisfying { it is AwsExplorerErrorNode }
                }
            } else {
                assertThat(node.children).hasOnlyOneElementSatisfying { it is AwsExplorerErrorNode }
            }
        }
    }

    private companion object {
        val sut = RdsExplorerRootNode()
    }
}
