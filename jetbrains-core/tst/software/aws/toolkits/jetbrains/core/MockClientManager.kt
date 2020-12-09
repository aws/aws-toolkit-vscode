// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.ThreadTracker
import com.intellij.testFramework.replaceService
import org.junit.rules.ExternalResource
import software.amazon.awssdk.core.SdkClient
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import kotlin.reflect.KClass

class MockClientManager : AwsClientManager() {
    private data class Key(
        val clazz: KClass<out SdkClient>,
        val region: AwsRegion? = null,
        val credProviderId: String? = null
    )

    private val mockClients = mutableMapOf<Key, SdkClient>()

    @Suppress("UNCHECKED_CAST")
    override fun <T : SdkClient> createNewClient(sdkClass: KClass<T>, region: AwsRegion, credProvider: ToolkitCredentialsProvider): T =
        mockClients[Key(sdkClass, region, credProvider.id)] as? T
            ?: mockClients[Key(sdkClass)] as? T
            ?: throw IllegalStateException("No mock registered for $sdkClass")

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

    companion object {
        /**
         * Replaces all required test services with the real version for the life of the [Disposable] to allow calls to AWS to succeed
         */
        fun useRealImplementations(disposable: Disposable) {
            val clientManager = AwsClientManager()
            Disposer.register(disposable, clientManager)
            ApplicationManager.getApplication().replaceService(ToolkitClientManager::class.java, clientManager, disposable)

            // Need to use real region provider to know about global services
            val regionProvider = AwsRegionProvider()
            ApplicationManager.getApplication().replaceService(ToolkitRegionProvider::class.java, regionProvider, disposable)

            // Make a new http client that is scoped to the disposable and replace the global one with it, otherwise the apache connection reaper thread
            // is detected as leaking threads and fails the tests
            // TODO: We aren't closing cred providers and sdks when they are removed, we need to see what ramifications that has
            ThreadTracker.longRunningThreadCreated(ApplicationManager.getApplication(), "idle-connection-reaper")

            val httpClient = AwsSdkClient()
            Disposer.register(disposable, httpClient)
            ApplicationManager.getApplication().replaceService(AwsSdkClient::class.java, httpClient, disposable)
        }
    }
}

// Scoped to this file only, users should be using MockClientManagerRule to enforce cleanup correctly
private fun getMockInstance(): MockClientManager = service<ToolkitClientManager>() as MockClientManager

class MockClientManagerRule : ExternalResource() {
    private lateinit var mockClientManager: MockClientManager

    override fun before() {
        mockClientManager = getMockInstance()
    }

    override fun after() {
        mockClientManager.reset()
    }

    @PublishedApi
    @Deprecated("Do not use, visible for inline")
    internal fun manager() = mockClientManager

    fun reset() {
        mockClientManager.reset()
    }

    inline fun <reified T : SdkClient> create(): T = delegateMock<T>().also {
        @Suppress("DEPRECATION")
        manager().register(T::class, it)
    }

    inline fun <reified T : SdkClient> create(region: AwsRegion, credProvider: ToolkitCredentialsProvider): T = delegateMock<T>().also {
        @Suppress("DEPRECATION")
        manager().register(T::class, it, region, credProvider)
    }
}
