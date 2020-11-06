// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.resources

import com.intellij.openapi.project.Project
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.slf4j.event.Level
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.s3.regionForBucket
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.filter
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object S3Resources {
    private val LOG = getLogger<S3Resources>()
    private val regions by lazy { AwsRegionProvider.getInstance().allRegions() }

    val LIST_REGIONALIZED_BUCKETS = ClientBackedCachedResource(S3Client::class, "s3.list_buckets") {
        val buckets = listBuckets().buckets()
        // TODO when the resource cache is coroutine based, remove the runBlocking and withContext
        runBlocking {
            // withContext is needed to put this on a thread pool
            withContext(ApplicationThreadPoolScope("ListRegionalizedBuckets").coroutineContext) {
                buckets.map { bucket ->
                    async {
                        LOG.tryOrNull("Cannot determine region for ${bucket.name()}", level = Level.WARN) {
                            regionForBucket(bucket.name())
                        }?.let { regions[it] }?.let {
                            RegionalizedBucket(bucket, it)
                        }
                    }
                }.awaitAll().filterNotNull()
            }
        }
    }

    val LIST_BUCKETS: Resource<List<Bucket>> = LIST_REGIONALIZED_BUCKETS.map { it.bucket }

    fun listBucketsByActiveRegion(project: Project): Resource<List<Bucket>> {
        val activeRegion = AwsConnectionManager.getInstance(project).activeRegion
        return LIST_REGIONALIZED_BUCKETS.filter { it.region == activeRegion }.map { it.bucket }
    }

    @JvmStatic
    fun listBucketNamesByActiveRegion(project: Project): Resource<List<String>> = listBucketsByActiveRegion(project).map { it.name() }

    @JvmStatic
    fun formatDate(date: Instant): String {
        val datetime = LocalDateTime.ofInstant(date, ZoneId.systemDefault())
        return datetime.atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("MMM d YYYY hh:mm:ss a z"))
    }

    data class RegionalizedBucket(val bucket: Bucket, val region: AwsRegion)
}
