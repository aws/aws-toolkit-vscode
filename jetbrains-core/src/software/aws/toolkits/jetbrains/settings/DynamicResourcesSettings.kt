// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.core.utils.replace

interface DynamicResourcesSettings {
    var selected: Set<String>

    companion object {
        fun getInstance(): DynamicResourcesSettings = service()
    }
}

@State(name = "resources", storages = [Storage("aws.xml")])
internal class DefaultDynamicResourcesSettings :
    DynamicResourcesSettings,
    SimplePersistentStateComponent<DynamicResourcesConfiguration>(DynamicResourcesConfiguration()) {
    override var selected: Set<String>
        get() = state.selected.toSet()
        set(value) {
            state.selected.replace(value)
        }
}

internal class DynamicResourcesConfiguration : BaseState() {
    // using a list because `stringSet` doesn't automatically increment the modification counter and ends up not getting persisted
    @get:Property
    val selected by list<String>()
}
