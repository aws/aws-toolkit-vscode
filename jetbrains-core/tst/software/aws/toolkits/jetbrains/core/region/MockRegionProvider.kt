// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.service
import org.junit.rules.ExternalResource
import software.amazon.awssdk.regions.Region
import software.aws.toolkits.core.region.AwsPartition
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.Service
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.core.utils.test.aString

private class MockRegionProvider : ToolkitRegionProvider() {
    private val overrideRegions: MutableMap<String, AwsRegion> = mutableMapOf()
    private val services: MutableMap<String, Service> = mutableMapOf()

    fun addRegion(region: AwsRegion): AwsRegion {
        overrideRegions[region.id] = region
        return region
    }

    fun addService(serviceName: String, service: Service) {
        services[serviceName] = service
    }

    fun reset() {
        overrideRegions.clear()
        services.clear()
    }

    override fun partitionData(): Map<String, PartitionData> {
        val combinedRegions = regions + overrideRegions
        return combinedRegions
            .asSequence()
            .associate {
                it.value.partitionId to PartitionData(
                    it.value.partitionId,
                    services,
                    combinedRegions.filterValues { regions -> regions.partitionId == it.value.partitionId }
                )
            }
    }

    override fun isServiceGlobal(region: AwsRegion, serviceId: String) =
        if (serviceId in services.keys) super.isServiceGlobal(region, serviceId) else false

    override fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean = true

    override fun defaultPartition(): AwsPartition = AWS_CLASSIC

    override fun defaultRegion(): AwsRegion = US_EAST_1

    companion object {
        private val US_EAST_1 = AwsRegion("us-east-1", "US East (N. Virginia)", "aws")
        private val AWS_CLASSIC = AwsPartition("aws", "AWS Classic", listOf(US_EAST_1))
        private val regions = mapOf(US_EAST_1.id to US_EAST_1)
        fun getInstance(): MockRegionProvider = ServiceManager.getService(ToolkitRegionProvider::class.java) as MockRegionProvider
    }
}

class MockRegionProviderRule : ExternalResource() {
    private lateinit var regionManager: MockRegionProvider

    override fun before() {
        regionManager = service<ToolkitRegionProvider>() as MockRegionProvider
    }

    override fun after() {
        reset()
    }

    fun addRegion(region: AwsRegion): AwsRegion = regionManager.addRegion(region)
    fun addRegion(sdkRegion: Region): AwsRegion = regionManager.addRegion(
        AwsRegion(
            id = sdkRegion.id(),
            name = sdkRegion.toString(),
            partitionId = sdkRegion.metadata().partition().id()
        )
    )

    fun createAwsRegion(id: String = uniqueRegionId(), partitionId: String = aString()): AwsRegion =
        anAwsRegion(id = id, partitionId = partitionId).also { regionManager.addRegion(it) }

    private fun uniqueRegionId(): String {
        repeat(10) {
            val generatedId = aRegionId()
            if (regionManager[generatedId] == null) {
                return generatedId
            }
        }
        throw IllegalStateException("Failed to generate a unique region ID")
    }

    fun defaultPartition(): AwsPartition = regionManager.defaultPartition()

    fun defaultRegion(): AwsRegion = regionManager.defaultRegion()

    fun addService(serviceName: String, service: Service) = regionManager.addService(serviceName, service)

    fun reset() {
        @Suppress("DEPRECATION")
        regionManager.reset()
    }
}

// dynamically get the default region from whatever is currently registered
fun getDefaultRegion() = service<ToolkitRegionProvider>().defaultRegion()
