// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@State(name = "meetQPage", storages = [Storage("aws.xml")])
class MeetQSettings : PersistentStateComponent<MeetQSettingsConfiguration> {
    private var state = MeetQSettingsConfiguration()
    override fun getState(): MeetQSettingsConfiguration? = state

    override fun loadState(state: MeetQSettingsConfiguration) {
        this.state = state
    }

    var shouldDisplayPage: Boolean
        get() = state.shouldDisplayPage
        set(value) {
            state.shouldDisplayPage = value
        }

    companion object {
        fun getInstance(): MeetQSettings = service()
    }
}
data class MeetQSettingsConfiguration(
    var shouldDisplayPage: Boolean = true
)
