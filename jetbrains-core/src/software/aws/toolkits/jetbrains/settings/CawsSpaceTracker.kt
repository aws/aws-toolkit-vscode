// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@State(name = "cawsSpace", storages = [Storage("aws.xml")])
class CawsSpaceTracker : PersistentStateComponent<CawsSpaceState> {
    private val state = CawsSpaceState()

    override fun getState() = state

    override fun loadState(state: CawsSpaceState) {
        this.state.lastSpaceName = state.lastSpaceName
    }

    fun lastSpaceName() = state.lastSpaceName

    fun changeSpaceName(newName: String?) {
        state.lastSpaceName = newName
    }

    companion object {
        fun getInstance() = service<CawsSpaceTracker>()
    }
}

data class CawsSpaceState(
    var lastSpaceName: String? = null
)

interface CawsSpaceSelectionChange {
    fun newSpace(spaceName: String)
}
