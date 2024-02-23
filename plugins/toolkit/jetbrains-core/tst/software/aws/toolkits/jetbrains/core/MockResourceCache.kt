// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ApplicationRule
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.runner.Description
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitAuthenticationProvider
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ConcurrentHashMap

@Suppress("UNCHECKED_CAST")
class MockResourceCache : AwsResourceCache {
    private val map = ConcurrentHashMap<CacheKey, Any>()

    override fun <T> getResourceIfPresent(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean
    ): T? = when (resource) {
        is Resource.View<*, T> -> getResourceIfPresent(resource.underlying, region, credentialProvider)?.let { resource.doMap(it, region) }
        is Resource.Cached<T> -> mockResourceIfPresent(resource, region, credentialProvider)
    }

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(resource.underlying, region, credentialProvider, useStale, forceFetch).thenApply {
            resource.doMap(it as Any, region)
        }
        is Resource.Cached<T> -> {
            mockResource(resource, region, credentialProvider)
        }
    }

    override fun <T> getResourceIfPresent(
        resource: Resource<T>,
        region: AwsRegion,
        tokenProvider: ToolkitBearerTokenProvider,
        useStale: Boolean
    ): T? = when (resource) {
        is Resource.View<*, T> -> getResourceIfPresent(resource.underlying, region, tokenProvider)?.let { resource.doMap(it, region) }
        is Resource.Cached<T> -> mockResourceIfPresent(resource, region, tokenProvider)
    }

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        tokenProvider: ToolkitBearerTokenProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(resource.underlying, region, tokenProvider, useStale, forceFetch).thenApply {
            resource.doMap(it as Any, region)
        }
        is Resource.Cached<T> -> {
            mockResource(resource, region, tokenProvider)
        }
    }

    private fun <T> mockResourceIfPresent(
        resource: Resource.Cached<T>,
        region: AwsRegion,
        credentials: ToolkitAuthenticationProvider
    ): T? = when (val value = map[CacheKey(resource.id, region.id, credentials.id)]) {
        is CompletableFuture<*> -> if (value.isDone) value.get() as T else null
        else -> value as? T?
    }

    private fun <T> mockResource(
        resource: Resource.Cached<T>,
        region: AwsRegion,
        credentials: ToolkitAuthenticationProvider
    ) = when (val value = map[CacheKey(resource.id, region.id, credentials.id)]) {
        is CompletableFuture<*> -> value as CompletionStage<T>
        else -> {
            val future = CompletableFuture<T>()
            ApplicationManager.getApplication().executeOnPooledThread {
                value?.also { future.complete(it as T) }
                    ?: future.completeExceptionally(IllegalStateException("No value found for $resource ${region.id} ${credentials.id} in mock"))
            }
            future
        }
    }

    override fun clear(resource: Resource<*>, connectionSettings: ClientConnectionSettings<*>) {
        when (resource) {
            is Resource.Cached<*> -> map.remove(CacheKey(resource.id, connectionSettings.region.id, connectionSettings.providerId))
            is Resource.View<*, *> -> clear(resource.underlying, connectionSettings)
        }
    }

    override fun clear(connectionSettings: ClientConnectionSettings<*>) {
        map.keys.removeIf { it.credentialsId == connectionSettings.providerId && it.regionId == connectionSettings.region.id }
    }

    override suspend fun clear() {
        map.clear()
    }

    fun entryCount() = map.size

    fun addEntry(resourceId: String, regionId: String, credentialsId: String, value: Any) {
        map[CacheKey(resourceId, regionId, credentialsId)] = value
    }

    companion object {
        @JvmStatic
        fun getInstance(): MockResourceCache = service<AwsResourceCache>() as MockResourceCache

        private data class CacheKey(val resourceId: String, val regionId: String, val credentialsId: String)
    }
}

class MockResourceCacheRule : ApplicationRule(), MockResourceCacheInterface by MockResourceCacheInterface.delegate() {
    public override fun before(description: Description) {
        super.before(description)
    }

    public override fun after() {
        runBlocking { cache.clear() }
    }
}

class MockResourceCacheExtension : BeforeEachCallback, AfterEachCallback, MockResourceCacheInterface by MockResourceCacheInterface.delegate() {
    private val rule = MockResourceCacheRule()

    override fun beforeEach(context: ExtensionContext) {
        rule.before(Description.EMPTY)
    }

    override fun afterEach(context: ExtensionContext) {
        rule.after()
    }
}

interface MockResourceCacheInterface {
    val cache: MockResourceCache

    fun addEntry(resourceId: String, regionId: String, credentialsId: String, value: Any) {
        cache.addEntry(resourceId, regionId, credentialsId, value)
    }

    fun addEntry(project: Project, resourceId: String, value: Any) {
        val connectionManager = AwsConnectionManager.getInstance(project)
        addEntry(resourceId, connectionManager.selectedRegion!!.id, connectionManager.selectedCredentialIdentifier!!.id, value)
    }

    fun <T> addEntry(project: Project, resource: Resource.Cached<T>, value: T) {
        addEntry(project, resource.id, value as Any)
    }

    fun <T> addEntry(project: Project, resourceId: String, value: CompletableFuture<T>) {
        val connectionManager = AwsConnectionManager.getInstance(project)
        addEntry(resourceId, connectionManager.selectedRegion!!.id, connectionManager.selectedCredentialIdentifier!!.id, value)
    }

    fun <T> addEntry(project: Project, resource: Resource.Cached<T>, value: CompletableFuture<T>) {
        addEntry(project, resource.id, value)
    }

    fun addEntry(project: Project, resourceId: String, throws: Exception) {
        addEntry(project, resourceId, CompletableFuture.failedFuture<Any>(throws))
    }

    fun <T> addEntry(connectionSettings: ConnectionSettings, resource: Resource.Cached<T>, value: CompletableFuture<T>) {
        addEntry(resource, connectionSettings.region.id, connectionSettings.credentials.id, value)
    }

    fun <T> addEntry(resource: Resource.Cached<T>, regionId: String, credentialsId: String, value: T) {
        addEntry(resource.id, regionId, credentialsId, value as Any)
    }

    fun <T> addEntry(resource: Resource.Cached<T>, regionId: String, credentialsId: String, value: CompletableFuture<T>) {
        addEntry(resource.id, regionId, credentialsId, value)
    }

    fun size() = cache.entryCount()

    companion object {
        fun delegate() = object : MockResourceCacheInterface {
            override val cache by lazy { MockResourceCache.getInstance() }
        }
    }
}
