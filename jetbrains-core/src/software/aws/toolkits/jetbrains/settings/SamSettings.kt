// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(name = "sam", storages = [Storage("aws.xml")])
class SamSettings : PersistentStateComponent<SamConfiguration> {
    private var state = SamConfiguration()

    override fun getState(): SamConfiguration = state

    override fun loadState(state: SamConfiguration) {
        this.state = state
    }

    var executablePath: String
        get() = state.executablePath
        set(value) {
            state.executablePath = value
        }

    var showAllHandlerGutterIcons: Boolean
        get() = state.showAllHandlerGutterIcons
        set(value) {
            state.showAllHandlerGutterIcons = value
        }

    companion object {
        @JvmStatic
        fun getInstance(): SamSettings = ServiceManager.getService(SamSettings::class.java)
    }
}

data class SamConfiguration(
    var executablePath: String = "",
    var showAllHandlerGutterIcons: Boolean = false
)
