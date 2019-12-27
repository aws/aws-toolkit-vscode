// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.ServiceManager
import software.amazon.awssdk.regions.providers.AwsProfileRegionProvider
import software.amazon.awssdk.regions.providers.AwsRegionProviderChain
import software.amazon.awssdk.regions.providers.SystemSettingsRegionProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.PartitionParser
import software.aws.toolkits.core.region.ServiceEndpointResource
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider

class AwsRegionProvider constructor(remoteResourceResolverProvider: RemoteResourceResolverProvider) : ToolkitRegionProvider() {
    private val partitions: Map<String, PartitionData> by lazy {
        val inputStream = remoteResourceResolverProvider.get().resolve(ServiceEndpointResource).toCompletableFuture().get()?.inputStream()
        val partitions = inputStream?.use { PartitionParser.parse(it) }?.partitions ?: return@lazy emptyMap<String, PartitionData>()

        partitions.asSequence().associateBy { it.partition }.mapValues {
            PartitionData(
                it.value.partitionName,
                it.value.services,
                it.value.regions.asSequence().associate { region -> region.key to AwsRegion(region.key, region.value.description, it.key) }
            )
        }
    }

    override fun partitionData(): Map<String, PartitionData> = partitions

    override fun defaultRegion(): AwsRegion = try {
        // Querying the instance metadata is expensive due to high timeouts and retries
        val regionProviderChange = AwsRegionProviderChain(SystemSettingsRegionProvider(), AwsProfileRegionProvider())
        regionProviderChange.region.id().let { regions(DEFAULT_PARTITION)[it] } ?: fallbackRegion()
    } catch (e: Exception) {
        LOG.warn(e) { "Failed to find default region" }
        fallbackRegion()
    }

    private fun fallbackRegion(): AwsRegion = regions(DEFAULT_PARTITION).getOrElse(DEFAULT_REGION) {
        throw IllegalStateException("Region provider data is missing default data")
    }

    companion object {
        private const val DEFAULT_REGION = "us-east-1"
        private const val DEFAULT_PARTITION = "aws"
        private val LOG = getLogger<AwsRegionProvider>()

        @JvmStatic
        fun getInstance(): ToolkitRegionProvider = ServiceManager.getService(ToolkitRegionProvider::class.java)
    }
}
