// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project

@State(name = "lambda", storages = [Storage("aws.xml")])
class LambdaSettings(private val project: Project) : PersistentStateComponent<LambdaConfiguration> {
    private var state = LambdaConfiguration()

    override fun getState(): LambdaConfiguration = state

    override fun loadState(state: LambdaConfiguration) {
        this.state = state
    }

    var showAllHandlerGutterIcons: Boolean
        get() = state.showAllHandlerGutterIcons
        set(value) {
            state.showAllHandlerGutterIcons = value
            project.messageBus.syncPublisher(LambdaSettingsChangeListener.TOPIC).samShowAllHandlerGutterIconsSettingsChange(value)
        }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): LambdaSettings = ServiceManager.getService(project, LambdaSettings::class.java)
    }
}

data class LambdaConfiguration(
    var showAllHandlerGutterIcons: Boolean = false
)
