// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.service
import org.slf4j.event.Level
import software.amazon.awssdk.regions.providers.AwsProfileRegionProvider
import software.amazon.awssdk.regions.providers.AwsRegionProviderChain
import software.amazon.awssdk.regions.providers.SystemSettingsRegionProvider
import software.aws.toolkits.core.region.AwsPartition
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.PartitionParser
import software.aws.toolkits.core.region.ServiceEndpointResource
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.logWhenNull
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider
import software.aws.toolkits.resources.BundledResources

class AwsRegionProvider : ToolkitRegionProvider() {
    private val regionChain by lazy {
        // Querying the instance metadata is expensive due to high timeouts and retries
        AwsRegionProviderChain(SystemSettingsRegionProvider(), AwsProfileRegionProvider())
    }
    private val partitions: Map<String, PartitionData> by lazy {
        val inputStream = RemoteResourceResolverProvider.getInstance().get().resolve(ServiceEndpointResource).toCompletableFuture().get()?.inputStream()
        val partitions = inputStream?.use { PartitionParser.parse(it) }?.partitions
            ?: BundledResources.ENDPOINTS_FILE.use { PartitionParser.parse(BundledResources.ENDPOINTS_FILE) }?.partitions
            ?: throw Exception("Failed to retrieve partitions.")

        partitions.asSequence().associateBy { it.partition }.mapValues {
            PartitionData(
                it.value.partitionName,
                it.value.services,
                it.value.regions.asSequence().associate { region -> region.key to AwsRegion(region.key, region.value.description, it.key) }
            )
        }
    }

    override fun partitionData(): Map<String, PartitionData> = partitions

    override fun defaultPartition(): AwsPartition = partitions().getValue(defaultRegion().partitionId)

    override fun defaultRegion(): AwsRegion {
        val regionIdFromChain = LOG.tryOrNull("Failed to find default region in chain", level = Level.WARN) {
            regionChain.region.id()
        }

        val regionFromChain = regionIdFromChain?.let { regionId ->
            LOG.logWhenNull("Could not find $regionId in endpoint data") {
                this[regionId]
            }
        }

        return regionFromChain
            ?: this[DEFAULT_REGION]
            ?: allRegions().values.firstOrNull()
            ?: throw IllegalStateException("Region provider data is missing default data")
    }

    companion object {
        private const val DEFAULT_REGION = "us-east-1"
        private val LOG = getLogger<AwsRegionProvider>()

        @JvmStatic
        fun getInstance(): ToolkitRegionProvider = service()
    }
}
