// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@State(name = "samAccDevMode", storages = [Storage("aws.xml")])
class SamDisplayDevModeWarningSettings : PersistentStateComponent<SamDevModeWarningConfiguration> {
    private var state = SamDevModeWarningConfiguration()

    override fun getState(): SamDevModeWarningConfiguration? = state

    override fun loadState(state: SamDevModeWarningConfiguration) {
        this.state = state
    }

    var showDevModeWarning: Boolean
        get() = state.showDevModeWarning
        set(value) {
            state.showDevModeWarning = value
        }

    companion object {
        fun getInstance(): SamDisplayDevModeWarningSettings = service()
    }
}

data class SamDevModeWarningConfiguration(
    var showDevModeWarning: Boolean = true
)
