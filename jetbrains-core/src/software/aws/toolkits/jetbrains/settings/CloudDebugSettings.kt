// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(name = "cloud_debug", storages = [Storage("aws.xml")])
class CloudDebugSettings : PersistentStateComponent<AwsCloudDebugConfiguration> {
    private var state = AwsCloudDebugConfiguration()

    override fun getState(): AwsCloudDebugConfiguration? = state

    override fun loadState(state: AwsCloudDebugConfiguration) {
        this.state = state
    }

    var showEnableDebugWarning: Boolean
        get() = state.showEnableDebugWarning
        set(value) {
            state.showEnableDebugWarning = value
        }

    companion object {
        @JvmStatic
        fun getInstance(): CloudDebugSettings = ServiceManager.getService(CloudDebugSettings::class.java)
    }
}

data class AwsCloudDebugConfiguration(
    var showEnableDebugWarning: Boolean = true
)
