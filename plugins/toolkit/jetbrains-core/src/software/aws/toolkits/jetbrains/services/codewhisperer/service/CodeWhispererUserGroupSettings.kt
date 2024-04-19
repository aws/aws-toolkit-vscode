// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import org.jetbrains.annotations.VisibleForTesting
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.AwsPlugin
import software.aws.toolkits.jetbrains.AwsToolkit
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

/**
 * Component controlling codewhisperer user group settings
 */
@State(name = "codewhispererUserGroupSettings", storages = [Storage("aws.xml")])
class CodeWhispererUserGroupSettings : PersistentStateComponent<CodeWhispererUserGroupStates> {
    private var version: String? = null

    private val settings = ConcurrentHashMap<String, String>()
    override fun getState() = CodeWhispererUserGroupStates(
        version,
        settings
    )

    override fun loadState(state: CodeWhispererUserGroupStates) {
        version = state.version

        settings.clear()
        settings.putAll(state.settings)
    }

    inline fun <reified T : CodeWhispererGroup> getGroup(): T? = getGroup(T::class)

    fun <T : CodeWhispererGroup> getGroup(clazz: KClass<T>): T? {
        @Suppress("UNCHECKED_CAST")
        return when (clazz) {
            CodeWhispererUserGroup::class -> {
                tryOrNull {
                    settings[USER_GROUP_KEY]?.let {
                        CodeWhispererUserGroup.valueOf(it)
                    }
                } as T?
            }
            CodeWhispererExpThresholdGroup::class -> {
                tryOrNull {
                    settings[EXP_THRESHOLD_KEY]?.let {
                        CodeWhispererExpThresholdGroup.valueOf(it)
                    }
                } as T?
            }
            else -> null
        }
    }

    fun getUserGroup(): CodeWhispererUserGroup {
        if (version != AwsToolkit.PLUGINS_INFO[AwsPlugin.TOOLKIT]?.version) {
            resetGroupSettings()
        }

        return getGroup<CodeWhispererUserGroup>() ?: determineUserGroup()
    }

    fun isExpThreshold(): Boolean {
        if (version != AwsToolkit.PLUGINS_INFO[AwsPlugin.TOOLKIT]?.version) {
            resetGroupSettings()
        }

        val group = getGroup<CodeWhispererExpThresholdGroup>()
        return (group ?: determineThresholdGroup()) == CodeWhispererExpThresholdGroup.Exp
    }

    @VisibleForTesting
    fun getVersion() = version

    @VisibleForTesting
    fun determineUserGroup(): CodeWhispererUserGroup {
        val group = CodeWhispererUserGroup.Control

        settings[USER_GROUP_KEY] = group.name
        version = AwsToolkit.PLUGINS_INFO[AwsPlugin.TOOLKIT]?.version

        return group
    }

    private fun determineThresholdGroup(): CodeWhispererExpThresholdGroup {
        val randomNum = Math.random()
        val group = if (randomNum < 1 / 2.0) {
            CodeWhispererExpThresholdGroup.Control
        } else {
            CodeWhispererExpThresholdGroup.Exp
        }

        settings[EXP_THRESHOLD_KEY] = group.name
        version = AwsToolkit.PLUGINS_INFO[AwsPlugin.TOOLKIT]?.version

        return group
    }

    private fun resetGroupSettings() {
        version = null
        settings.clear()
    }

    companion object {
        fun getInstance(): CodeWhispererUserGroupSettings = service()

        // TODO: add into CodeWhispererGroup interface
        const val USER_GROUP_KEY = "userGroup"

        const val EXP_THRESHOLD_KEY = "expThreshold"
    }
}

data class CodeWhispererUserGroupStates(
    var version: String? = null,
    var settings: Map<String, String> = emptyMap()
)

interface CodeWhispererGroup

enum class CodeWhispererUserGroup : CodeWhispererGroup {
    Control,
    CrossFile,
    Classifier,
    RightContext,
}

enum class CodeWhispererExpThresholdGroup : CodeWhispererGroup {
    Control,
    Exp
}
