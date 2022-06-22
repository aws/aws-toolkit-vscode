// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.experiments

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentManager.Companion.EXPERIMENT_CHANGED
import software.aws.toolkits.jetbrains.utils.deserializeState
import software.aws.toolkits.jetbrains.utils.rules.RegistryRule
import software.aws.toolkits.jetbrains.utils.serializeState
import java.time.Duration
import java.time.Instant

class ToolkitExperimentManagerTest {

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    @JvmField
    @Rule
    val systemPropertyHelper = SystemPropertyHelper()

    @JvmField
    @Rule
    val developerModeRule = RegistryRule("aws.toolkit.developerMode", desiredEnabledState = false)

    @Test
    fun `experiments can be enabled by system property`() {
        val experiment = DummyExperiment()

        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)

        assertThat(experiment.isEnabled()).isFalse

        System.setProperty("aws.experiment.${experiment.id}", "")
        assertThat(experiment.isEnabled()).isTrue

        System.setProperty("aws.experiment.${experiment.id}", " ")
        assertThat(experiment.isEnabled()).isTrue

        System.setProperty("aws.experiment.${experiment.id}", "true")
        assertThat(experiment.isEnabled()).isTrue

        System.setProperty("aws.experiment.${experiment.id}", "True")
        assertThat(experiment.isEnabled()).isTrue

        System.setProperty("aws.experiment.${experiment.id}", "TRUE")
        assertThat(experiment.isEnabled()).isTrue

        System.setProperty("aws.experiment.${experiment.id}", "false")
        assertThat(experiment.isEnabled()).isFalse

        System.setProperty("aws.experiment.${experiment.id}", "foobar")
        assertThat(experiment.isEnabled()).isFalse
    }

    @Test
    fun `only registered experiments can be enabled`() {
        val registered = DummyExperiment()
        val notRegistred = DummyExperiment()

        val sut = ToolkitExperimentManager.getInstance()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(registered), disposableRule.disposable)

        sut.setState(registered, enabled = true)
        sut.setState(notRegistred, enabled = true)

        assertThat(registered.isEnabled()).isTrue
        assertThat(notRegistred.isEnabled()).isFalse
    }

    @Test
    fun `hidden experiments are not considered visible`() {
        val regular = DummyExperiment()
        val hidden = DummyExperiment(hidden = true)

        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(regular, hidden), disposableRule.disposable)

        assertThat(ToolkitExperimentManager.visibleExperiments()).containsOnly(regular)
    }

    @Test
    fun `experiments can be enabled by default`() {
        val experiment = DummyExperiment(default = true)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isTrue
    }

    @Test
    fun `experiments enabled by default can be disabled`() {
        val experiment = DummyExperiment(default = true)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        experiment.setState(false)
        assertThat(experiment.isEnabled()).isFalse
    }

    @Test
    fun `state only stored if it differs from default, allowing a previously released experiment to become enabled by default`() {
        val experiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        experiment.setState(true)

        assertThat(ToolkitExperimentManager.getInstance().state.value).containsEntry(experiment.id, true)
        experiment.setState(false)
        assertThat(ToolkitExperimentManager.getInstance().state.value).doesNotContainKey(experiment.id)
    }

    @Test
    fun `experiments are considered equal based on id`() {
        val first = DummyExperiment()
        val second = DummyExperiment(id = first.id)

        assertThat(first === second).isFalse
        assertThat(first).isEqualTo(second)
    }

    @Test
    fun `all experiments are enabled in developer mode`() {
        val experiment = DummyExperiment()

        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        developerModeRule.setState(true)

        assertThat(experiment.isEnabled()).isTrue
    }

    @Test
    fun `explicit enable or disable takes precedence over dev mode and system property`() {
        val experiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        developerModeRule.setState(true)
        experiment.setState(false)
        System.setProperty("aws.experiment.${experiment.id}", "true")

        assertThat(experiment.isEnabled()).isFalse
    }

    @Test
    fun `system property takes precedence over dev mode`() {
        val experiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        developerModeRule.setState(true)
        System.setProperty("aws.experiment.${experiment.id}", "false")

        assertThat(experiment.isEnabled()).isFalse
    }

    @Test
    fun `it correctly persists`() {
        val experiment = DummyExperiment()
        val permanentlySuppressed = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        val now = Instant.now()

        val sut = ToolkitExperimentManager.getInstance()

        sut.shouldPrompt(experiment, now)
        sut.neverPrompt(permanentlySuppressed)
        experiment.setState(true)
        val serialized = serializeState("experiments", sut)

        val other = ToolkitExperimentManager()
        deserializeState(serialized, other)

        assertThat(other.isEnabled(experiment)).isTrue
        assertThat(other.shouldPrompt(experiment)).isFalse
        assertThat(other.shouldPrompt(experiment, now.minusMillis(5))).isFalse
    }

    @Test
    fun `event publishing - enabling experiments will emit event`() {
        val anExperiment = DummyExperiment()
        assertThat(anExperiment.isEnabled()).isFalse
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        subscribeToTopic(mockListener)
        anExperiment.setState(true)

        argumentCaptor<ToolkitExperiment>().apply {
            verify(mockListener).enableSettingsStateChanged(capture())
            assertThat(allValues).hasSize(1)
            assertThat(firstValue.id).isEqualTo(anExperiment.id)
        }
    }

    @Test
    fun `event publishing - disabling experiments will emit event`() {
        val experiment = DummyExperiment(default = true)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isTrue
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        subscribeToTopic(mockListener)
        experiment.setState(false)

        argumentCaptor<ToolkitExperiment>().apply {
            verify(mockListener).enableSettingsStateChanged(capture())
            assertThat(allValues).hasSize(1)
            assertThat(firstValue.id).isEqualTo(experiment.id)
        }
    }

    @Test
    fun `updated experiment state is reflected when event is consumed`() {
        val anExperiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(anExperiment), disposableRule.disposable)
        subscribeToTopic { toolkitExperiment -> assertThat(toolkitExperiment.isEnabled()).isTrue }
        anExperiment.setState(true)
    }

    @Test
    fun `event publishing - setting experiments ineffectively will not emit message - true`() {
        val experiment = DummyExperiment(default = true)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isTrue
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        subscribeToTopic(mockListener)

        experiment.setState(true)

        verifyNoInteractions(mockListener)
    }

    @Test
    fun `event publishing - setting experiments ineffectively will not emit message - false`() {
        val experiment = DummyExperiment(default = false)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isFalse
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        subscribeToTopic(mockListener)

        experiment.setState(false)
        verifyNoInteractions(mockListener)
    }

    @Test
    fun `experiment prompts - experiment never seen before will prompt`() {
        val experiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)

        val sut = ToolkitExperimentManager.getInstance()

        assertThat(sut.shouldPrompt(experiment)).isTrue
    }

    @Test
    fun `experiment prompts - when experiment enabled return false`() {
        val experiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)

        val sut = ToolkitExperimentManager.getInstance()
        experiment.setState(true)

        assertThat(sut.shouldPrompt(experiment)).isFalse
    }

    @Test
    fun `experiment prompts - prompts are snoozed for the specified duration`() {
        val experiment = DummyExperiment()
        val now = Instant.now()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)

        val sut = ToolkitExperimentManager.getInstance()

        assertThat(sut.shouldPrompt(experiment, now)).isTrue
        assertThat(sut.shouldPrompt(experiment, now)).isFalse
        assertThat(sut.shouldPrompt(experiment, now.plusMillis(2))).isTrue
    }

    @Test
    fun `experiment prompts - can be permanently snoozed`() {
        val experiment = DummyExperiment()
        val now = Instant.now()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)

        val sut = ToolkitExperimentManager.getInstance()

        sut.neverPrompt(experiment)
        assertThat(sut.shouldPrompt(experiment, now.plusMillis(2))).isFalse
    }

    private fun subscribeToTopic(listener: ToolkitExperimentStateChangedListener) {
        val conn = ApplicationManager.getApplication().messageBus.connect(disposableRule.disposable)
        conn.subscribe(EXPERIMENT_CHANGED, listener)
    }

    @Test
    fun `Enabling experiments will emit event`() {
        val anExperiment = DummyExperiment()
        assertThat(anExperiment.isEnabled()).isFalse
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(ToolkitExperimentManager.EXPERIMENT_CHANGED, mockListener)
        anExperiment.setState(true)

        argumentCaptor<ToolkitExperiment>().apply {
            verify(mockListener).enableSettingsStateChanged(capture())
            assertThat(allValues).hasSize(1)
            assertThat(firstValue.id).isEqualTo(anExperiment.id)
        }

        conn.dispose()
    }

    @Test
    fun `Disabling experiments will emit event`() {
        val experiment = DummyExperiment(default = true)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isTrue
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(ToolkitExperimentManager.EXPERIMENT_CHANGED, mockListener)
        experiment.setState(false)

        argumentCaptor<ToolkitExperiment>().apply {
            verify(mockListener).enableSettingsStateChanged(capture())
            assertThat(allValues).hasSize(1)
            assertThat(firstValue.id).isEqualTo(experiment.id)
        }

        conn.dispose()
    }

    @Test
    fun `Setting experiments ineffectively will not emit message - true`() {
        val experiment = DummyExperiment(default = true)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isTrue
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(ToolkitExperimentManager.EXPERIMENT_CHANGED, mockListener)

        experiment.setState(true)
        verifyNoInteractions(mockListener)

        conn.dispose()
    }

    @Test
    fun `Setting experiments ineffectively will not emit message - false`() {
        val experiment = DummyExperiment(default = false)
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)
        assertThat(experiment.isEnabled()).isFalse
        val mockListener: ToolkitExperimentStateChangedListener = mock()
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(ToolkitExperimentManager.EXPERIMENT_CHANGED, mockListener)

        experiment.setState(false)
        verifyNoInteractions(mockListener)

        conn.dispose()
    }
}

class DummyExperiment(
    id: String = aString(),
    hidden: Boolean = false,
    default: Boolean = false,
    suggestionSnooze: Duration = Duration.ofMillis(1)
) : ToolkitExperiment(id, { "Dummy ($id)" }, { "Dummy Description" }, hidden, default, suggestionSnooze)
