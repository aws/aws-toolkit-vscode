// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.core.utils.test.hasOnlyElementsOfType
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.RdsExplorerRootNode
import software.aws.toolkits.jetbrains.services.rds.resources.LIST_SUPPORTED_CLUSTERS
import software.aws.toolkits.jetbrains.services.rds.resources.LIST_SUPPORTED_INSTANCES

class RdsExplorerNodeTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val sut = RdsExplorerRootNode()

    @Test
    fun `database resources are listed`() {
        val instances = RdsEngine.values().flatMap { it.engines }.associateWith { RuleUtils.randomName(prefix = "instance-$it-") }
        val clusters = RdsEngine.values().flatMap { it.engines }.associateWith { RuleUtils.randomName(prefix = "cluster-$it-") }

        resourceCache.addEntry(
            projectRule.project,
            LIST_SUPPORTED_INSTANCES,
            instances.map { dbInstance(it.key, it.value) }
        )

        resourceCache.addEntry(
            projectRule.project,
            LIST_SUPPORTED_CLUSTERS,
            clusters.map { dbInstance(it.key, it.value) }
        )

        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)

        val databasesNames = instances.values + clusters.values
        assertThat(serviceRootNode.children)
            .hasSize(databasesNames.size)
            .hasOnlyElementsOfType<RdsNode>()
            .allSatisfy {
                assertThat(it.resourceType()).isEqualTo("instance")
            }.extracting<String> {
                it.database.identifier
            }.containsExactlyInAnyOrderElementsOf(databasesNames)
    }

    @Test
    fun `database clusters are de-duped with instances`() {
        val db = dbInstance(RdsEngine.values().first().engines.first(), aString())

        resourceCache.addEntry(
            projectRule.project,
            LIST_SUPPORTED_INSTANCES,
            listOf(db)
        )

        resourceCache.addEntry(
            projectRule.project,
            LIST_SUPPORTED_CLUSTERS,
            listOf(db)
        )

        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)

        assertThat(serviceRootNode.children)
            .hasOnlyElementsOfType<RdsNode>()
            .extracting<RdsDatabase> {
                it.database
            }.containsOnly(db)
    }

    private fun dbInstance(engine: String, name: String) = RdsDatabase(
        identifier = name,
        engine = engine,
        arn = aString(),
        iamDatabaseAuthenticationEnabled = true,
        endpoint = Endpoint(
            host = aString(),
            port = -1
        ),
        masterUsername = aString()
    )
}
