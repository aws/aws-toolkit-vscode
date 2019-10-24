// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.components.ServiceManager
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.Partition
import software.aws.toolkits.core.region.PartitionParser
import software.aws.toolkits.core.region.ServiceEndpointResource
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.inputStream
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

    override fun defaultRegion(): AwsRegion = DefaultAwsRegionProviderChain().region?.id()?.let { regions[it] }
        ?: regions.getOrElse(DEFAULT_REGION) { throw IllegalStateException("Region provider data is missing default region") }

    override fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean {
        val currentPartition = partition ?: return false
        val service = currentPartition.services[serviceName] ?: return false
        return service.isGlobal || service.endpoints.containsKey(region.id)
    }

    companion object {
        private const val DEFAULT_REGION = "us-east-1"

        @JvmStatic
        fun getInstance(): ToolkitRegionProvider = ServiceManager.getService(ToolkitRegionProvider::class.java)
    }
}
