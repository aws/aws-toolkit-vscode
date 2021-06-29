// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(name = "ecsExec", storages = [Storage("aws.xml")])
class EcsExecCommandSettings : PersistentStateComponent<AwsEcsExecConfiguration> {
    private var state = AwsEcsExecConfiguration()

    override fun getState(): AwsEcsExecConfiguration? = state

    override fun loadState(state: AwsEcsExecConfiguration) {
        this.state = state
    }

    var showExecuteCommandWarning: Boolean
        get() = state.showExecuteCommandWarning
        set(value) {
            state.showExecuteCommandWarning = value
        }

    companion object {
        fun getInstance(): EcsExecCommandSettings = ApplicationManager.getApplication().getService(EcsExecCommandSettings::class.java)
    }
}

data class AwsEcsExecConfiguration(
    var showExecuteCommandWarning: Boolean = true
)
