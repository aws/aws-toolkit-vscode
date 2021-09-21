// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.RoamingType
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.annotations.Attribute
import com.intellij.util.xmlb.annotations.Property
import com.intellij.util.xmlb.annotations.Tag

@State(name = "tools", storages = [Storage("aws.xml", roamingType = RoamingType.DISABLED)])
class ToolSettings : SimplePersistentStateComponent<ExecutableOptions>(ExecutableOptions()) {
    fun getExecutablePath(executable: ToolType<*>) = state.value[executable.id]?.executablePath

    fun setExecutablePath(executable: ToolType<*>, value: String?) {
        if (value == null) {
            state.value.remove(executable.id)
        } else {
            val original = state.value[executable.id] ?: ExecutableState2()
            state.value[executable.id] = original.copy(executablePath = value)
        }
    }

    companion object {
        fun getInstance(): ToolSettings = service()
    }
}

class ExecutableOptions : BaseState() {
    @get:Property
    val value by map<String, ExecutableState2>()
}

@Tag("ExecutableState")
data class ExecutableState2(
    @Attribute(value = "path")
    val executablePath: String? = null,
)
