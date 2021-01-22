// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.SortedComboBoxModel
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets.lambdaMemory
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets.lambdaTimeout
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField
import software.aws.toolkits.jetbrains.ui.HandlerPanel
import software.aws.toolkits.jetbrains.ui.SliderPanel
import java.util.Comparator
import javax.swing.JComboBox
import javax.swing.JPanel

class RawSettings(private val project: Project) {
    lateinit var panel: JPanel
        private set
    lateinit var handlerPanel: HandlerPanel
        private set
    lateinit var runtime: JComboBox<Runtime>
        private set
    lateinit var timeoutSlider: SliderPanel
        private set
    lateinit var memorySlider: SliderPanel
        private set
    lateinit var environmentVariables: EnvironmentVariablesTextField
        private set
    private lateinit var runtimeModel: SortedComboBoxModel<Runtime>

    var lastSelectedRuntime: Runtime? = null

    private fun createUIComponents() {
        runtimeModel = SortedComboBoxModel(compareBy(Comparator.naturalOrder()) { it: Runtime -> it.toString() })
        runtime = ComboBox(runtimeModel)
        handlerPanel = HandlerPanel(project)
        timeoutSlider = lambdaTimeout()
        memorySlider = lambdaMemory()
        environmentVariables = EnvironmentVariablesTextField()
    }

    init {
        runtime.addActionListener {
            val index = runtime.selectedIndex
            if (index < 0) {
                lastSelectedRuntime = null
                return@addActionListener
            }
            val selectedRuntime = runtime.getItemAt(index)
            if (selectedRuntime == lastSelectedRuntime) return@addActionListener
            lastSelectedRuntime = selectedRuntime
            handlerPanel.setRuntime(selectedRuntime)
        }
        val supportedRuntimes = LambdaBuilder.supportedRuntimeGroups().flatMap { it.supportedSdkRuntimes }.sorted()
        runtimeModel.setAll(supportedRuntimes)
        runtime.selectedItem = RuntimeGroup.determineRuntime(project)?.let { if (it.toSdkRuntime() in supportedRuntimes) it else null }
    }
}
