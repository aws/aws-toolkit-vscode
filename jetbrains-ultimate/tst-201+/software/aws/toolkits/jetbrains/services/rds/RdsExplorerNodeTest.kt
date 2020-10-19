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
        val databases = RdsEngine.values().flatMap { it.engines }.associateWith { RuleUtils.randomName(prefix = "$it-") }
        resourceCache.addEntry(
            projectRule.project,
            RdsResources.LIST_SUPPORTED_INSTANCES,
            databases.map { dbInstance(it.key, it.value) }
        )
        val serviceRootNode = sut.buildServiceRootNode(projectRule.project)
        assertThat(serviceRootNode.children).hasSize(databases.size).hasOnlyElementsOfType<RdsNode>().allSatisfy {
            assertThat(it.resourceType()).isEqualTo("instance")
        }.extracting<String> {
            it.dbInstance.dbInstanceIdentifier()
        }.containsOnly(*databases.values.toTypedArray())
    }

    private companion object {
        val sut = RdsExplorerRootNode()
        fun dbInstance(engine: String, name: String): DBInstance =
            DBInstance.builder().engine(engine).dbName(name).dbInstanceIdentifier(name).dbInstanceArn("").build()
    }
}
