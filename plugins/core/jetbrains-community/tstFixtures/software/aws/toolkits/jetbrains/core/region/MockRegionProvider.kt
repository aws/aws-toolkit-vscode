// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.service
import com.intellij.testFramework.ApplicationRule
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.ExtensionContext
import software.amazon.awssdk.regions.Region
import software.aws.toolkits.core.region.AwsPartition
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.Service
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.rules.ClearableLazy

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
        private val AWS_CLASSIC = AwsPartition("aws", "AWS Classic", listOf(US_EAST_1))
        private val regions = mapOf(US_EAST_1.id to US_EAST_1)
        fun getInstance(): MockRegionProvider = service<ToolkitRegionProvider>() as MockRegionProvider
    }
}

sealed class MockRegionProviderBase : ApplicationRule() {
    private val lazyRegionProvider = ClearableLazy {
        MockRegionProvider.getInstance()
    }

    private val regionManager: MockRegionProvider
        get() = lazyRegionProvider.value

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
        error("Failed to generate a unique region ID")
    }

    fun defaultPartition(): AwsPartition = regionManager.defaultPartition()

    fun defaultRegion(): AwsRegion = regionManager.defaultRegion()

    fun addService(serviceName: String, service: Service) = regionManager.addService(serviceName, service)

    override fun after() {
        lazyRegionProvider.ifSet {
            reset()
            lazyRegionProvider.clear()
        }
    }

    fun reset() {
        regionManager.reset()
    }
}

class MockRegionProviderRule : MockRegionProviderBase()

class MockRegionProviderExtension : MockRegionProviderBase(), AfterEachCallback {
    override fun afterEach(context: ExtensionContext?) {
        after()
    }
}

// dynamically get the default region from whatever is currently registered
fun getDefaultRegion() = service<ToolkitRegionProvider>().defaultRegion()

val US_EAST_1 = AwsRegion("us-east-1", "US East (N. Virginia)", "aws")
