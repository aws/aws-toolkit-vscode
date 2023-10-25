// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@State(name = "gettingStarted", storages = [Storage("aws.xml")])
class GettingStartedSettings : PersistentStateComponent<GettingStartedSettingsConfiguration> {
    private var state = GettingStartedSettingsConfiguration()
    override fun getState(): GettingStartedSettingsConfiguration? = state

    override fun loadState(state: GettingStartedSettingsConfiguration) {
        this.state = state
    }

    var shouldDisplayPage: Boolean
        get() = state.shouldDisplayPage
        set(value) {
            state.shouldDisplayPage = value
        }

    companion object {
        fun getInstance(): GettingStartedSettings = service()
    }
}
data class GettingStartedSettingsConfiguration(
    var shouldDisplayPage: Boolean = true
)
