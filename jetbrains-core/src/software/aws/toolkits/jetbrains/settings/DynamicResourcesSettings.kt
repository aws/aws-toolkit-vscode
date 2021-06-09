// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources

@State(name = "dynamic_resources", storages = [Storage("aws.xml")])
class DynamicResourcesSettings : PersistentStateComponent<DynamicResourcesConfiguration> {
    private var state = DynamicResourcesConfiguration()
    var selected: Set<String>
        get() = state.selected
        set(value) {
            state.selected = value
        }

    fun resourcesAvailable() = runBlocking { DynamicResources.SUPPORTED_TYPES.await() }.size - state.selected.size

    override fun getState() = state

    override fun loadState(state: DynamicResourcesConfiguration) {
        this.state = state
    }

    companion object {
        fun getInstance(): DynamicResourcesSettings = ServiceManager.getService(DynamicResourcesSettings::class.java)
    }
}

data class DynamicResourcesConfiguration(
    var selected: Set<String> = emptySet()
)
