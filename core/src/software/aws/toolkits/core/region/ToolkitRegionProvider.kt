// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

import java.util.concurrent.ConcurrentHashMap

/**
 * An SPI to provide regions supported by this toolkit
 */
abstract class ToolkitRegionProvider {
    protected data class PartitionData(val description: String, val services: Map<String, Service>, val regions: Map<String, AwsRegion>)

    protected abstract fun partitionData(): Map<String, PartitionData>

    private val globalCache = ConcurrentHashMap<Pair<AwsRegion, String>, AwsRegion>()

    /**
     * Returns a map of region ID([AwsRegion.id]) to [AwsRegion]
     */
    @Deprecated("Not partition aware")
    fun regions(): Map<String, AwsRegion> = partitionData()[DEFAULT_PARTITION]?.regions?.asSequence()?.associate { it.key to it.value } ?: emptyMap()

    /**
     * Returns a map of region ID([AwsRegion.id]) to [AwsRegion] for the specified partition
     */
    fun regions(partitionId: String): Map<String, AwsRegion> = partitionData()[partitionId]?.regions
        ?: throw IllegalArgumentException("Unknown partition $partitionId")

    /**
     * Returns a map of partition ID([AwsPartition.id]) to [AwsPartition]
     */
    fun partitions(): Map<String, AwsPartition> = partitionData().asSequence()
        .associate { it.key to AwsPartition(it.key, it.value.description, it.value.regions.values) }

    /**
     * Returns the default region to use based on the environment
     */
    abstract fun defaultRegion(): AwsRegion

    @Deprecated("This loads the default region if specified region doesn't exist which does not make sense")
    fun lookupRegionById(regionId: String?): AwsRegion = regions()[regionId] ?: defaultRegion()

    fun isServiceGlobal(region: AwsRegion, serviceId: String): Boolean {
        val partition = partitionData()[region.partitionId] ?: throw IllegalStateException("Partition data is missing for ${region.partitionId}")
        val service = partition.services[serviceId] ?: throw IllegalStateException("Unknown service $serviceId in ${region.partitionId}")
        return service.isGlobal
    }

    fun getGlobalRegionForService(region: AwsRegion, serviceId: String): AwsRegion {
        val cacheKey = region to serviceId
        globalCache[cacheKey]?.let {
            return it
        }

        val partition = partitionData()[region.partitionId] ?: throw IllegalStateException("Partition data is missing for ${region.partitionId}")
        val service = partition.services[serviceId] ?: throw IllegalStateException("Unknown service $serviceId in ${region.partitionId}")
        if (!service.isGlobal) {
            throw IllegalStateException("$serviceId is not global in ${region.partitionId}")
        }

        // TODO: A few services lack partition endpoint like Shield and MTurk, how should that be handled?
        val partitionEndpoint = service.partitionEndpoint ?: throw IllegalStateException("$serviceId in ${region.partitionId} lacks a partitionEndpoint")
        return globalCache.computeIfAbsent(cacheKey) {
            AwsRegion(partitionEndpoint, partitionEndpoint, region.partitionId)
        }
    }

    open fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean {
        val currentPartition = partitionData()[region.partitionId] ?: return false
        val service = currentPartition.services[serviceName] ?: return false
        return service.isGlobal || service.endpoints.containsKey(region.id)
    }

    companion object {
        private const val DEFAULT_PARTITION = "aws"
    }
}
