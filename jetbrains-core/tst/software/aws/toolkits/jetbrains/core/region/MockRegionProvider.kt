// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.ServiceManager
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider

class MockRegionProvider : ToolkitRegionProvider {
    private val overrideRegions: MutableMap<String, AwsRegion> = mutableMapOf()

    fun addRegion(region: AwsRegion): AwsRegion {
        overrideRegions[region.id] = region
        return region
    }

    fun reset() {
        overrideRegions.clear()
    }

    override fun defaultRegion(): AwsRegion = US_EAST_1

    override fun regions(): Map<String, AwsRegion> = regions + overrideRegions

    override fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean = true

    companion object {
        private val US_EAST_1 = AwsRegion("us-east-1", "US East (N. Virginia)")
        private val regions = mapOf(US_EAST_1.id to US_EAST_1)
        fun getInstance(): MockRegionProvider = ServiceManager.getService(ToolkitRegionProvider::class.java) as MockRegionProvider
    }
}
