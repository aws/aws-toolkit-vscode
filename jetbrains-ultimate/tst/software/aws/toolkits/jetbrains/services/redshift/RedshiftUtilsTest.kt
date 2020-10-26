// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.redshift

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.redshift.model.Cluster
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.sts.StsResources

class RedshiftUtilsTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val defaultRegion = RuleUtils.randomName()
    private val region = AwsRegion(defaultRegion, RuleUtils.randomName(), RuleUtils.randomName())
    private val clusterId = RuleUtils.randomName()
    private val accountId = RuleUtils.randomName()
    private val mockCluster = mock<Cluster> {
        on { clusterIdentifier() } doReturn clusterId
    }

    @Test
    fun `Account ID ARN`() {
        resourceCache.addEntry(projectRule.project, StsResources.ACCOUNT, accountId)
        val arn = projectRule.project.clusterArn(mockCluster, region)
        assertThat(arn).isEqualTo("arn:${region.partitionId}:redshift:${region.id}:$accountId:cluster:$clusterId")
    }

    @Test
    fun `No account ID ARN`() {
        val arn = projectRule.project.clusterArn(mockCluster, region)
        assertThat(arn).isEqualTo("arn:${region.partitionId}:redshift:${region.id}::cluster:$clusterId")
    }
}
