// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.sts.StsResources
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ConcurrentHashMap

@Suppress("UNCHECKED_CAST")
class MockResourceCache(private val project: Project) : AwsResourceCache {

    private val map = ConcurrentHashMap<CacheKey, Any>()
    private val accountSettings by lazy { ProjectAccountSettingsManager.getInstance(project) }

    override fun <T> getResourceIfPresent(resource: Resource<T>, useStale: Boolean): T? =
        getResourceIfPresent(resource, accountSettings.activeRegion, accountSettings.activeCredentialProvider, useStale)

    override fun <T> getResourceIfPresent(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean
    ): T? = when (resource) {
        is Resource.View<*, T> -> getResourceIfPresent(resource.underlying, region, credentialProvider)?.let { resource.doMap(it) }
        is Resource.Cached<T> -> mockResourceIfPresent(resource, region, credentialProvider)
    }

    override fun <T> getResource(resource: Resource<T>, useStale: Boolean, forceFetch: Boolean): CompletionStage<T> =
        getResource(resource, accountSettings.activeRegion, accountSettings.activeCredentialProvider, useStale, forceFetch)

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(resource.underlying, region, credentialProvider, useStale, forceFetch).thenApply { resource.doMap(it as Any) }
        is Resource.Cached<T> -> {
            mockResource(resource, region, credentialProvider)
        }
    }

    private fun <T> mockResourceIfPresent(
        resource: Resource.Cached<T>,
        region: AwsRegion,
        credentials: ToolkitCredentialsProvider
    ): T? = when (val value = map[CacheKey(resource.id, region.id, credentials.id)]) {
        is CompletableFuture<*> -> if (value.isDone) value.get() as T else null
        else -> value as? T?
    }

    private fun <T> mockResource(
        resource: Resource.Cached<T>,
        region: AwsRegion,
        credentials: ToolkitCredentialsProvider
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

    override fun clear(resource: Resource<*>) {
        clear(resource, accountSettings.activeRegion, accountSettings.activeCredentialProvider)
    }

    override fun clear(resource: Resource<*>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider) {
        when (resource) {
            is Resource.Cached<*> -> map.remove(CacheKey(resource.id, region.id, credentialProvider.id))
            is Resource.View<*, *> -> clear(resource.underlying, region, credentialProvider)
        }
    }

    override fun clear() {
        map.clear()
    }

    fun <T> addEntry(resource: Resource.Cached<T>, value: T) =
        addEntry(resource, accountSettings.activeRegion.id, accountSettings.activeCredentialProvider.id, value)

    fun <T> addEntry(resource: Resource.Cached<T>, value: CompletableFuture<T>) =
        addEntry(resource, accountSettings.activeRegion.id, accountSettings.activeCredentialProvider.id, value)

    fun <T> addEntry(resource: Resource.Cached<T>, regionId: String, credentialsId: String, value: T) {
        map[CacheKey(resource.id, regionId, credentialsId)] = value as Any
    }

    fun <T> addEntry(resource: Resource.Cached<T>, regionId: String, credentialsId: String, value: CompletableFuture<T>) {
        map[CacheKey(resource.id, regionId, credentialsId)] = value as Any
    }

    fun addValidAwsCredential(regionId: String, credentialsId: String, awsAccountId: String) {
        map[CacheKey(StsResources.ACCOUNT.id, regionId, credentialsId)] = awsAccountId as Any
    }

    fun addInvalidAwsCredential(regionId: String, credentialsId: String) {
        val future = CompletableFuture<String>()
        ApplicationManager.getApplication().executeOnPooledThread {
            future.completeExceptionally(IllegalStateException("Invalid AWS credentials $credentialsId"))
        }
        map[CacheKey(StsResources.ACCOUNT.id, regionId, credentialsId)] = future
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): MockResourceCache = ServiceManager.getService(project, AwsResourceCache::class.java) as MockResourceCache

        private data class CacheKey(val resourceId: String, val regionId: String, val credentialsId: String)
    }
}
