// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.utils.delegateMock
import java.time.Instant
import java.util.concurrent.CompletableFuture

class S3ServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val mockClientManager = MockClientManagerRule { projectRule.project }

    private val mockClient = delegateMock<S3Client>()
    private val mockSettingsManager by lazy {
        ProjectAccountSettingsManager.getInstance(projectRule.project)
            as MockProjectAccountSettingsManager
    }

    @Before
    fun setUp() {
        resourceCache().clear()
        mockSettingsManager.changeRegion(AwsRegion.GLOBAL)
        mockClientManager.manager().register(S3Client::class, mockClient)
    }

    @Test
    fun s3BucketsAreListed() {
        val bucketList = listOf("bcd", "abc", "AEF", "ZZZ")
        resourceCache().s3buckets(bucketList)
        bucketList.map { resourceCache().bucketRegion(it) }
        val children = S3ServiceNode(projectRule.project).children

        assertThat(children).allMatch { it is S3BucketNode }
        assertThat(children.filterIsInstance<S3BucketNode>().map { it.displayName() }).containsExactlyInAnyOrder(
            "abc",
            "AEF",
            "bcd",
            "ZZZ"
        )
    }

    @Test
    fun noBucketsInTheRegion() {
        val bucketList = emptyList<String>()
        resourceCache().s3buckets(bucketList)
        bucketList.map { resourceCache().bucketRegion(it) }
        val children = S3ServiceNode(projectRule.project).children
        assertThat(children).allMatch { it is AwsExplorerEmptyNode }
    }

    @Test
    fun errorLoadingBuckets() {
        resourceCache().addEntry(S3Resources.LIST_BUCKETS, CompletableFuture<List<Bucket>>().also {
            it.completeExceptionally(RuntimeException("Simulated error"))
        })
        resourceCache().addEntry(S3Resources.bucketRegion("foo"), CompletableFuture<String>().also {
            it.completeExceptionally(RuntimeException("Simulated error"))
        })
        val children = S3ServiceNode(projectRule.project).children
        assertThat(children).allMatch { it is AwsExplorerErrorNode }
    }

    private fun bucketData(bucketName: String) =
        Bucket.builder()
            .creationDate(Instant.parse("1995-10-23T10:12:35Z"))
            .name(bucketName)
            .build()

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.bucketRegion(name: String) {
        this.addEntry(S3Resources.bucketRegion(name), CompletableFuture.completedFuture("aws-global"))
    }

    private fun MockResourceCache.s3buckets(names: List<String>) {
        this.addEntry(
            S3Resources.LIST_BUCKETS,
            CompletableFuture.completedFuture(names.map(::bucketData))
        )
    }
}
