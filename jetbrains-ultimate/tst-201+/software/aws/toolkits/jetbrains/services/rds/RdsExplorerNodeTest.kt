// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.rds.model.DBInstance
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.test.hasOnlyElementsOfType
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.RdsExplorerRootNode

class RdsExplorerNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun `database resources are listed`() {
        val mysqlDatabase = RuleUtils.randomName()
        val postgresDatabase = RuleUtils.randomName()
        val auroraMySqlDatabase = RuleUtils.randomName()
        val auroraPostgresDatabase = RuleUtils.randomName()
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_SUPPORTED_INSTANCES,
            listOf(
                dbInstance(RdsEngine.MySql, mysqlDatabase),
                dbInstance(RdsEngine.Postgres, postgresDatabase),
                dbInstance(RdsEngine.AuroraMySql, auroraMySqlDatabase),
                dbInstance(RdsEngine.AuroraPostgres, auroraPostgresDatabase)
            )
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).hasSize(4).hasOnlyElementsOfType<RdsNode>().allSatisfy {
            assertThat(it.resourceType()).isEqualTo("instance")
        }.anySatisfy {
            assertThat(it.dbInstance.dbInstanceIdentifier()).isEqualTo(mysqlDatabase)
        }.anySatisfy {
            assertThat(it.dbInstance.dbInstanceIdentifier()).isEqualTo(postgresDatabase)
        }.anySatisfy {
            assertThat(it.dbInstance.dbInstanceIdentifier()).isEqualTo(auroraMySqlDatabase)
        }.anySatisfy {
            assertThat(it.dbInstance.dbInstanceIdentifier()).isEqualTo(auroraPostgresDatabase)
        }
    }

    private companion object {
        val sut = RdsExplorerRootNode()
        fun dbInstance(engine: RdsEngine, name: String): DBInstance =
            DBInstance.builder().engine(engine.engine).dbName(name).dbInstanceIdentifier(name).dbInstanceArn("").build()
    }
}
