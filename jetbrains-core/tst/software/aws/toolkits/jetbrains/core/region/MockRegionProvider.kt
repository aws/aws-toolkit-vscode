// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider

class MockRegionProvider : ToolkitRegionProvider {
    private val overrideRegions: MutableMap<String, AwsRegion> = mutableMapOf("us-east-1" to usEast)

    fun addRegion(region: AwsRegion) {
        overrideRegions[region.id] = region
    }

    fun reset() {
        overrideRegions.clear()
    }

    override fun defaultRegion(): AwsRegion = regions.getValue(defaultRegionKey)

    override fun regions(): Map<String, AwsRegion> = regions + overrideRegions

    override fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean = true

    companion object {
        private val usEast = AwsRegion("us-east-1", "US East (N. Virginia)")
        private var defaultRegionKey = "us-east-1"
        private val regions = mapOf("us-east-1" to usEast)
    }
}