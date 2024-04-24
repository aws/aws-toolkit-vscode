// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.settings

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.annotations.Property

@State(name = "codewhispererSettings", storages = [Storage("aws.xml")])
class CodeWhispererSettings : PersistentStateComponent<CodeWhispererConfiguration> {
    private val state = CodeWhispererConfiguration()

    fun toggleIncludeCodeWithReference(value: Boolean) {
        state.value[CodeWhispererConfigurationType.IsIncludeCodeWithReference] = value
    }

    fun isIncludeCodeWithReference() = state.value.getOrDefault(
        CodeWhispererConfigurationType.IsIncludeCodeWithReference,
        false
    )

    fun toggleImportAdder(value: Boolean) {
        state.value[CodeWhispererConfigurationType.IsImportAdderEnabled] = value
    }

    fun isImportAdderEnabled() = state.value.getOrDefault(
        CodeWhispererConfigurationType.IsImportAdderEnabled,
        true
    )

    fun toggleMetricOptIn(value: Boolean) {
        state.value[CodeWhispererConfigurationType.OptInSendingMetric] = value
    }

    fun isMetricOptIn() = state.value.getOrDefault(
        CodeWhispererConfigurationType.OptInSendingMetric,
        true
    )

    companion object {
        fun getInstance(): CodeWhispererSettings = service()
    }

    override fun getState(): CodeWhispererConfiguration = CodeWhispererConfiguration().apply { value.putAll(state.value) }

    override fun loadState(state: CodeWhispererConfiguration) {
        this.state.value.clear()
        this.state.value.putAll(state.value)
    }
}

class CodeWhispererConfiguration : BaseState() {
    @get:Property
    val value by map<CodeWhispererConfigurationType, Boolean>()
}

enum class CodeWhispererConfigurationType {
    IsIncludeCodeWithReference,
    OptInSendingMetric,
    IsImportAdderEnabled,
    IsAutoUpdateEnabled,
    IsAutoUpdateNotificationEnabled,
    IsAutoUpdateFeatureNotificationShownOnce
}
