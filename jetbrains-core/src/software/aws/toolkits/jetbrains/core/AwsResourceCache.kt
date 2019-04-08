// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap

// TODO to be replaced with an actual resource implementation

interface AwsResourceCache {
    fun lambdaFunctions(): CompletableFuture<List<LambdaFunction>>

    companion object {
        fun getInstance(project: Project): AwsResourceCache =
            ServiceManager.getService(project, AwsResourceCache::class.java)
    }
}

class DefaultAwsResourceCache(
    private val accountSettingsManager: ProjectAccountSettingsManager,
    private val clientManager: ToolkitClientManager
) : AwsResourceCache {
    private val cache = ConcurrentHashMap<String, Any>()

    @Suppress("UNCHECKED_CAST")
    override fun lambdaFunctions(): CompletableFuture<List<LambdaFunction>> {
        val credentialProvider = try {
            accountSettingsManager.activeCredentialProvider
        } catch (_: Exception) {
            return CompletableFuture.completedFuture(emptyList())
        }

        val region = accountSettingsManager.activeRegion
        val credentialProviderId = credentialProvider.id

        val resourceKey = "$region:$credentialProviderId:lambdafunctions"

        val cachedResult = cache[resourceKey]
        cachedResult?.let {
            return CompletableFuture.completedFuture(cachedResult as List<LambdaFunction>)
        }

        val resultFuture = CompletableFuture<List<LambdaFunction>>()
        val client = clientManager.getClient<LambdaClient>()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val results = client.listFunctionsPaginator().functions()
                    .map { it.toDataClass(credentialProviderId, region) }
                    .toList()
                cache.putIfAbsent(resourceKey, results)
                resultFuture.complete(results)
            } catch (e: Exception) {
                resultFuture.completeExceptionally(e)
            }
        }

        return resultFuture
    }
}
