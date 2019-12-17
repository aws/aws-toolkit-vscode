// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.ServiceManager
import software.amazon.awssdk.regions.providers.AwsProfileRegionProvider
import software.amazon.awssdk.regions.providers.AwsRegionProviderChain
import software.amazon.awssdk.regions.providers.SystemSettingsRegionProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.Partition
import software.aws.toolkits.core.region.PartitionParser
import software.aws.toolkits.core.region.ServiceEndpointResource
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider

class AwsRegionProvider constructor(remoteResourceResolverProvider: RemoteResourceResolverProvider) : ToolkitRegionProvider {
    private val regions: Map<String, AwsRegion>
    private val partition: Partition?

    init {
        val inputStream = remoteResourceResolverProvider.get().resolve(ServiceEndpointResource).toCompletableFuture().get()?.inputStream()
        // TODO: handle non-standard AWS partitions based on account type
        partition = inputStream?.let { PartitionParser.parse(it) }?.getPartition("aws")
        regions = partition?.regions?.map { (key, region) ->
            key to AwsRegion(key, region.description)
        }?.toMap() ?: emptyMap()
    }

    override fun regions() = regions

    override fun defaultRegion(): AwsRegion = try {
        // TODO: Querying the instance metadata is expensive due to high timeouts and retries This currently can run on the UI thread, so
        // ignore it and only check env vars and default profile. We should refactor this so this can be transferred to background thread
        // https://youtrack.jetbrains.com/issue/RIDER-35092
        val regionProviderChange = AwsRegionProviderChain(SystemSettingsRegionProvider(), AwsProfileRegionProvider())
        regionProviderChange.region.id().let { regions[it] } ?: fallbackRegion()
    } catch (e: Exception) {
        LOG.warn(e) { "Failed to find default region" }
        fallbackRegion()
    }

    private fun fallbackRegion(): AwsRegion = regions.getOrElse(DEFAULT_REGION) {
        throw IllegalStateException("Region provider data is missing default region")
    }

    override fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean {
        val currentPartition = partition ?: return false
        val service = currentPartition.services[serviceName] ?: return false
        return service.isGlobal || service.endpoints.containsKey(region.id)
    }

    companion object {
        private const val DEFAULT_REGION = "us-east-1"
        private val LOG = getLogger<AwsRegionProvider>()

        @JvmStatic
        fun getInstance(): ToolkitRegionProvider = ServiceManager.getService(ToolkitRegionProvider::class.java)
    }
}
