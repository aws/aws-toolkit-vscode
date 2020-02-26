// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import org.jetbrains.annotations.TestOnly

@State(name = "sam", storages = [Storage("aws.xml")])
class SamSettings : PersistentStateComponent<SamConfiguration> {
    private var state = SamConfiguration()

    override fun getState(): SamConfiguration = state

    override fun loadState(state: SamConfiguration) {
        this.state = state
    }

    companion object {
        @JvmStatic
        @TestOnly
        fun getInstance(): SamSettings = ServiceManager.getService(SamSettings::class.java)
    }
}

data class SamConfiguration(
    var savedExecutablePath: String? = null
)
