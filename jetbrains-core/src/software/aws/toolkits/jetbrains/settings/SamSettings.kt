// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

    /**
     * Returns the path to the SAM CLI executable by first using the manual value,
     * if it is not set attempts to auto-detect it
     */
    val executablePath: String?
        get() = if (state.savedExecutablePath.isNullOrEmpty()) {
            SamExecutableDetector().find()
        } else {
            state.savedExecutablePath
        }

    /**
     * Exposes the saved (aka manually set) path to SAM CLI executable
     */
    var savedExecutablePath: String?
        get() = state.savedExecutablePath
        set(value) {
            state.savedExecutablePath = value
        }

    companion object {
        @JvmStatic
        fun getInstance(): SamSettings = ServiceManager.getService(SamSettings::class.java)
    }
}

data class SamConfiguration(
    var savedExecutablePath: String? = null
)
