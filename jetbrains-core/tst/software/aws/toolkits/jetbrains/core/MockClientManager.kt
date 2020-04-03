// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ProjectRule
import org.junit.rules.ExternalResource
import software.amazon.awssdk.core.SdkClient
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import kotlin.reflect.KClass

class MockClientManager(project: Project) : AwsClientManager(project) {
    private data class Key(
        val clazz: KClass<out SdkClient>,
        val region: AwsRegion? = null,
        val credProviderId: String? = null
    )

    private val mockClients = mutableMapOf<Key, SdkClient>()

    @Suppress("UNCHECKED_CAST")
    override fun <T : SdkClient> createNewClient(key: AwsClientKey, region: AwsRegion, credProvider: ToolkitCredentialsProvider): T =
        mockClients[Key(key.serviceClass, region, credProvider.id)] as? T
            ?: mockClients[Key(key.serviceClass)] as? T
            ?: throw IllegalStateException("No mock registered for $key")

    override fun dispose() {
        super.dispose()
        reset()
    }

    // Note: You must pass KClass of the interface, since we do not do instanceof checks, but == on the classes
    // This will lead to comparing the anonymous mock proxy to the interface and it will fail
    @Deprecated("Do not use, use MockClientManagerRule")
    fun register(clazz: KClass<out SdkClient>, sdkClient: SdkClient) {
        mockClients[Key(clazz)] = sdkClient
    }

    @Deprecated("Do not use, use MockClientManagerRule")
    fun <T : SdkClient> register(clazz: KClass<out SdkClient>, sdkClient: T, region: AwsRegion, credProvider: ToolkitCredentialsProvider) {
        mockClients[Key(clazz, region, credProvider.id)] = sdkClient
    }

    fun reset() {
        super.clear()
        mockClients.clear()
    }
}

// Scoped to this file only, users should be using MockClientManagerRule to enforce cleanup correctly
private fun getMockInstance(project: Project): MockClientManager = ServiceManager.getService(project, ToolkitClientManager::class.java) as MockClientManager

class MockClientManagerRule(private val project: () -> Project) : ExternalResource() {
    constructor(projectRule: ProjectRule) : this({ projectRule.project })
    constructor(projectRule: CodeInsightTestFixtureRule) : this({ projectRule.project })

    private lateinit var mockClientManager: MockClientManager

    override fun before() {
        mockClientManager = getMockInstance(project())
    }

    override fun after() {
        mockClientManager.reset()
    }

    @PublishedApi
    @Deprecated("Do not use, visible for inline")
    internal fun manager() = mockClientManager

    inline fun <reified T : SdkClient> create(): T = delegateMock<T>().also {
        @Suppress("DEPRECATION")
        manager().register(T::class, it)
    }

    inline fun <reified T : SdkClient> create(region: AwsRegion, credProvider: ToolkitCredentialsProvider): T = delegateMock<T>().also {
        @Suppress("DEPRECATION")
        manager().register(T::class, it, region, credProvider)
    }
}
