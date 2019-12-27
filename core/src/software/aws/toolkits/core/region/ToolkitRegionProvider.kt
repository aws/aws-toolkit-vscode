// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

/**
 * An SPI to provide regions supported by this toolkit
 */
abstract class ToolkitRegionProvider {
    protected data class PartitionData(val description: String, val services: Map<String, Service>, val regions: Map<String, AwsRegion>)

    protected abstract fun partitionData(): Map<String, PartitionData>

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

    open fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean {
        val currentPartition = partitionData()[region.partitionId] ?: return false
        val service = currentPartition.services[serviceName] ?: return false
        return service.isGlobal || service.endpoints.containsKey(region.id)
    }

    companion object {
        private const val DEFAULT_PARTITION = "aws"
    }
}
