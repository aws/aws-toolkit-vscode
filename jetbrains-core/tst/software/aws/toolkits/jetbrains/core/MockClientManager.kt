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
import software.aws.toolkits.jetbrains.utils.delegateMock
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import kotlin.reflect.KClass

class MockClientManager(project: Project) : AwsClientManager(project, AwsSdkClient.getInstance()) {
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
        mockClients.clear()
    }

    fun register(clazz: KClass<out SdkClient>, sdkClient: SdkClient) {
        mockClients[Key(clazz)] = sdkClient
    }

    fun <T : SdkClient> register(clazz: KClass<out SdkClient>, sdkClient: T, region: AwsRegion, credProvider: ToolkitCredentialsProvider) {
        mockClients[Key(clazz, region, credProvider.id)] = sdkClient
    }

    fun reset() {
        super.clear()
        mockClients.clear()
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): MockClientManager = ServiceManager.getService(project, ToolkitClientManager::class.java) as MockClientManager
    }
}

class MockClientManagerRule(private val project: () -> Project) : ExternalResource() {
    constructor(projectRule: ProjectRule) : this({ projectRule.project })
    constructor(projectRule: CodeInsightTestFixtureRule) : this({ projectRule.project })

    private lateinit var mockClientManager: MockClientManager

    override fun before() {
        mockClientManager = MockClientManager.getInstance(project())
    }

    override fun after() {
        mockClientManager.reset()
    }

    fun manager() = mockClientManager

    inline fun <reified T : SdkClient> create(): T = delegateMock<T>().also {
        manager().register(T::class, it)
    }

    inline fun <reified T : SdkClient> create(region: AwsRegion, credProvider: ToolkitCredentialsProvider): T = delegateMock<T>().also {
        manager().register(T::class, it, region, credProvider)
    }
}