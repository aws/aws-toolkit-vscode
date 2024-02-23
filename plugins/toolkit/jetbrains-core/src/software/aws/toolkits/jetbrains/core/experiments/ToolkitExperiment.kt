// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.experiments

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.util.messages.Topic
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.core.utils.replace
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.ExperimentState.Activated
import software.aws.toolkits.telemetry.ExperimentState.Deactivated
import java.time.Duration
import java.time.Instant

/**
 * Used to control the state of an experimental feature.
 *
 * Use the `aws.toolkit.experiment` extensionpoint to register experiments. This surfaces the configuration in the AWS Settings panel - and in sub-menus.
 *
 * @param hidden determines whether this experiment should surface in the settings/menus; hidden experiments can only be enabled by system property or manually modifying config in aws.xml
 * @param default determines the default state of an experiment
 * @param suggestionSnooze how long to wait between prompting a suggestion to enable the experiment (when using the experiment suggestion system ([ToolkitExperiment.suggest]))
 *
 * `ToolkitExperiment` implementations should be an `object` for example:
 *
 * ```
 * object MyExperiment : ToolkitExperiment(..)
 * ```
 *
 * This allows simple use at branch-points for the experiment via the available extension functions:
 *
 * ```
 * if (MyExperiment.isEnabled()) {
 *   // surface experience
 * }
 * ```
 */
abstract class ToolkitExperiment(
    internal val id: String,
    internal val title: () -> String,
    internal val description: () -> String,
    internal val hidden: Boolean = false,
    internal val default: Boolean = false,
    internal val suggestionSnooze: Duration = Duration.ofDays(7)
) {
    override fun equals(other: Any?) = (other as? ToolkitExperiment)?.id?.equals(id) == true
    override fun hashCode() = id.hashCode()
}

fun ToolkitExperiment.isEnabled(): Boolean = ToolkitExperimentManager.getInstance().isEnabled(this)
internal fun ToolkitExperiment.setState(enabled: Boolean) = ToolkitExperimentManager.getInstance().setState(this, enabled)

/**
 * Surface a notification suggesting that the given experiment be enabled.
 */
fun ToolkitExperiment.suggest() {
    if (ToolkitExperimentManager.getInstance().shouldPrompt(this)) {
        notifyInfo(
            title = message("aws.toolkit.experimental.suggestion.title"),
            content = message("aws.toolkit.experimental.suggestion.description", title(), description()),
            notificationActions = listOf(
                createNotificationExpiringAction(EnableExperiment(this)),
                createNotificationExpiringAction(NeverShowAgain(this))
            ),
            stripHtml = false
        )
    }
}

private class EnableExperiment(private val experiment: ToolkitExperiment) :
    DumbAwareAction(message("aws.toolkit.experimental.enable")) {
    override fun actionPerformed(e: AnActionEvent) {
        experiment.setState(true)
    }
}

private class NeverShowAgain(private val experiment: ToolkitExperiment) : DumbAwareAction(message("settings.never_show_again")) {
    override fun actionPerformed(e: AnActionEvent) {
        ToolkitExperimentManager.getInstance().neverPrompt(experiment)
    }
}

@State(name = "experiments", storages = [Storage("aws.xml")])
internal class ToolkitExperimentManager : PersistentStateComponent<ExperimentState> {
    private val state = ExperimentState()
    private val enabledState get() = state.value

    fun isEnabled(experiment: ToolkitExperiment): Boolean =
        EP_NAME.extensionList.contains(experiment) && enabledState.getOrDefault(experiment.id, getDefault(experiment))

    fun setState(experiment: ToolkitExperiment, enabled: Boolean) {
        val previousState = isEnabled(experiment)
        if (enabled == getDefault(experiment)) {
            enabledState.remove(experiment.id)
        } else {
            enabledState[experiment.id] = enabled
        }
        if (enabled != previousState) {
            ApplicationManager.getApplication().messageBus.syncPublisher(EXPERIMENT_CHANGED).enableSettingsStateChanged(experiment)
        }
        AwsTelemetry.experimentActivation(
            experimentId = experiment.id,
            experimentState = if (enabled) {
                Activated
            } else {
                Deactivated
            }
        )
    }

    override fun getState(): ExperimentState = state

    override fun loadState(loadedState: ExperimentState) {
        state.value.replace(loadedState.value)
        state.nextSuggestion.replace(loadedState.nextSuggestion)
    }

    private fun getDefault(experiment: ToolkitExperiment): Boolean {
        val systemProperty = System.getProperty("aws.experiment.${experiment.id}")
        return when {
            systemProperty != null -> systemProperty.isBlank() || systemProperty.equals("true", ignoreCase = true)
            AwsToolkit.isDeveloperMode() -> true
            else -> experiment.default
        }
    }

    internal fun shouldPrompt(experiment: ToolkitExperiment, now: Instant = Instant.now()): Boolean {
        if (experiment.isEnabled()) {
            return false
        }
        val should = state.nextSuggestion[experiment.id]?.let { now.isAfter(Instant.ofEpochMilli(it)) } ?: true
        if (should) {
            state.nextSuggestion[experiment.id] = now.plus(experiment.suggestionSnooze).toEpochMilli()
        }
        return should
    }

    internal fun neverPrompt(experiment: ToolkitExperiment) {
        state.nextSuggestion[experiment.id] = Long.MAX_VALUE // This is ~240 years in the future, effectively "never".
    }

    companion object {
        internal val EP_NAME = ExtensionPointName.create<ToolkitExperiment>("aws.toolkit.experiment")
        internal val EXPERIMENT_CHANGED =
            Topic.create("experiment service enable state changed", ToolkitExperimentStateChangedListener::class.java)
        internal fun getInstance(): ToolkitExperimentManager = service()
        internal fun visibleExperiments(): List<ToolkitExperiment> = EP_NAME.extensionList.filterNot { it.hidden }
        internal fun enabledExperiments(): List<ToolkitExperiment> = EP_NAME.extensionList.filter { it.isEnabled() }
    }
}

internal class ExperimentState : BaseState() {
    // This represents whether an experiment is enabled or not, don't want to rename it as that will
    // cause problems with any experiments already out there in the wild who've been persisted
    // as 'value'
    @get:Property
    val value by map<String, Boolean>()

    @get:Property
    val nextSuggestion by map<String, Long>()
}

fun interface ToolkitExperimentStateChangedListener {
    fun enableSettingsStateChanged(toolkitExperiment: ToolkitExperiment)
}
