// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.S3ExplorerRootNode
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import java.time.Instant
import java.util.concurrent.CompletableFuture

class S3ServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @JvmField
    @Rule
    val regionProvider = MockRegionProviderRule()

    @Test
    fun s3BucketsAreListed() {
        val bucketList = listOf("bcd", "abc", "AEF", "ZZZ")
        s3buckets(bucketList)
        val children = S3ServiceNode(projectRule.project, S3_EXPLORER_NODE).children

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
        s3buckets(emptyList())
        val children = S3ServiceNode(projectRule.project, S3_EXPLORER_NODE).children
        assertThat(children).allMatch { it is AwsExplorerEmptyNode }
    }

    @Test
    fun errorLoadingBuckets() {
        resourceCache.addEntry(
            projectRule.project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            CompletableFuture<List<S3Resources.RegionalizedBucket>>().also {
                it.completeExceptionally(RuntimeException("Simulated error"))
            }
        )
        val children = S3ServiceNode(projectRule.project, S3_EXPLORER_NODE).children
        assertThat(children).allMatch { it is AwsExplorerErrorNode }
    }

    private fun bucketData(bucketName: String) = Bucket.builder()
        .creationDate(Instant.parse("1995-10-23T10:12:35Z"))
        .name(bucketName)
        .build()

    private fun s3buckets(names: List<String>) {
        resourceCache.addEntry(
            projectRule.project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            CompletableFuture.completedFuture(names.map { S3Resources.RegionalizedBucket(bucketData(it), regionProvider.defaultRegion()) })
        )
    }

    private companion object {
        val S3_EXPLORER_NODE = S3ExplorerRootNode()
    }
}
