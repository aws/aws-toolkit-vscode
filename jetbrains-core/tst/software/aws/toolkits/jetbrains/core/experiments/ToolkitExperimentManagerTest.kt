// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.experiments

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.deserializeState
import software.aws.toolkits.jetbrains.utils.rules.RegistryRule
import software.aws.toolkits.jetbrains.utils.serializeState

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

        assertThat(ToolkitExperimentManager.visibileExperiments()).containsOnly(regular)
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
    fun `explicit enable or disable takes precidence over dev mode and system property`() {
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
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(experiment), disposableRule.disposable)

        val sut = ToolkitExperimentManager.getInstance()

        experiment.setState(true)
        val serialized = serializeState("experiments", sut)
        deserializeState(serialized, sut)

        assertThat(experiment.isEnabled()).isTrue
    }
}

class DummyExperiment(id: String = aString(), hidden: Boolean = false, default: Boolean = false) :
    ToolkitExperiment(id, { "Dummy ($id)" }, { "Dummy Description" }, hidden, default)
