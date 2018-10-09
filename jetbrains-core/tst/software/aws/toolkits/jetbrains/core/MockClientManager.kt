// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.core.SdkClient
import software.aws.toolkits.core.ToolkitClientManager
import kotlin.reflect.KClass

class MockClientManager(private val project: Project) : AwsClientManager(project, AwsSdkClient.getInstance()) {
    private val mockClients = mutableMapOf<KClass<out SdkClient>, SdkClient>()

    @Suppress("UNCHECKED_CAST")
    override fun <T : SdkClient> createNewClient(key: AwsClientKey): T {
        return mockClients[key.serviceClass] as? T ?: throw IllegalStateException("No mock registered for $key")
    }

    override fun dispose() {
        mockClients.clear()
    }

    fun register(clazz: KClass<out SdkClient>, sdkClient: SdkClient) {
        mockClients[clazz] = sdkClient
    }

    fun reset() {
        mockClients.clear()
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): MockClientManager {
            return ServiceManager.getService(project, ToolkitClientManager::class.java) as MockClientManager
        }
    }
}