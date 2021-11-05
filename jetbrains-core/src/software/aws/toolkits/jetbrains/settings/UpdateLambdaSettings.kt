// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@State(name = "updateLambdaState", storages = [Storage("aws.xml")])
private class UpdateLambdaState : PersistentStateComponent<UpdateLambda> {
    private var settings = UpdateLambda()

    override fun getState(): UpdateLambda = settings
    override fun loadState(state: UpdateLambda) {
        this.settings = state
    }

    companion object {
        @JvmStatic
        internal fun getInstance(): UpdateLambdaState = service()
    }
}

class UpdateLambdaSettings private constructor(private val arn: String) {
    private val stateService = UpdateLambdaState.getInstance()

    var useContainer: Boolean?
        get() = stateService.state.configs[arn]?.useContainer
        set(value) {
            stateService.state.configs.computeIfAbsent(arn) { UpdateConfig() }.useContainer = value ?: false
        }

    var bucketName: String?
        get() = stateService.state.configs[arn]?.bucketName
        set(value) {
            stateService.state.configs.computeIfAbsent(arn) { UpdateConfig() }.bucketName = value
        }

    var ecrRepo: String?
        get() = stateService.state.configs[arn]?.ecrRepo
        set(value) {
            stateService.state.configs.computeIfAbsent(arn) { UpdateConfig() }.ecrRepo = value
        }

    var dockerfile: String?
        get() = stateService.state.configs[arn]?.dockerfile
        set(value) {
            stateService.state.configs.computeIfAbsent(arn) { UpdateConfig() }.dockerfile = value
        }

    companion object {
        fun getInstance(arn: String) = UpdateLambdaSettings(arn)
    }
}

data class UpdateLambda(
    var configs: MutableMap<String, UpdateConfig> = mutableMapOf()
)

data class UpdateConfig(
    var bucketName: String? = null,
    var ecrRepo: String? = null,
    var dockerfile: String? = null,
    var useContainer: Boolean = false
)
