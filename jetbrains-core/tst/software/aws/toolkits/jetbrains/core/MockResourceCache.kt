// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ConcurrentHashMap

@Suppress("UNCHECKED_CAST")
class MockResourceCache : AwsResourceCache {
    private val map = ConcurrentHashMap<Resource<*>, Any>()
    override fun <T> getResourceIfPresent(resource: Resource<T>, useStale: Boolean): T? = mockResourceIfPresent(resource)

    override fun <T> getResourceIfPresent(resource: Resource<T>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider, useStale: Boolean): T? =
        mockResourceIfPresent(resource)

    override fun <T> getResource(resource: Resource<T>, useStale: Boolean, forceFetch: Boolean) = mockResource(resource)

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = mockResource(resource)

    private fun <T> mockResourceIfPresent(resource: Resource<T>): T? = when (val value = map[resource]) {
        is CompletableFuture<*> -> if (value.isDone) value.get() as T else null
        else -> value as? T?
    }

    private fun <T> mockResource(resource: Resource<T>) = when (val value = map[resource]) {
        is CompletableFuture<*> -> value as CompletionStage<T>
        else -> {
            val future = CompletableFuture<T>()
            ApplicationManager.getApplication().executeOnPooledThread {
                value?.also { future.complete(it as T) } ?: future.completeExceptionally(IllegalStateException("No value found for $resource in mock"))
            }
            future
        }
    }

    override fun clear(resource: Resource<*>) {
        TODO("not implemented")
    }

    override fun clear(resource: Resource<*>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider) {
        TODO("not implemented")
    }

    override fun clear() {
        TODO("not implemented")
    }

    fun <T> addEntry(resource: Resource<T>, value: T) {
        map[resource] = value as Any
    }

    fun <T> addEntry(resource: Resource<T>, value: CompletableFuture<T>) {
        map[resource] = value as Any
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): MockResourceCache = ServiceManager.getService(project, AwsResourceCache::class.java) as MockResourceCache
    }
}