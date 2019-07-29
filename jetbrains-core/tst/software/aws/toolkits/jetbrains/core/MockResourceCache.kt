// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

@Suppress("UNCHECKED_CAST")
class MockResourceCache : AwsResourceCache {

    override fun <T> getResource(resource: CachedResource<T>, useStale: Boolean, forceFetch: Boolean) = resourceFuture as CompletionStage<T>

    override fun <T> getResource(
        resource: CachedResource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = resourceFuture as CompletionStage<T>

    override fun clear(resource: CachedResource<*>) {
        TODO("not implemented")
    }

    override fun clear(resource: CachedResource<*>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider) {
        TODO("not implemented")
    }

    override fun clear() {
        TODO("not implemented")
    }

    val resourceFuture = CompletableFuture<Any>()

    companion object {
        @JvmStatic
        fun getInstance(project: Project): MockResourceCache = ServiceManager.getService(project, AwsResourceCache::class.java) as MockResourceCache
    }
}