// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.SortedComboBoxModel
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets.lambdaMemory
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets.lambdaTimeout
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.ui.HandlerPanel
import software.aws.toolkits.jetbrains.ui.KeyValueTextField
import software.aws.toolkits.jetbrains.ui.SliderPanel
import java.util.Comparator
import javax.swing.JComboBox
import javax.swing.JPanel

class RawSettings(private val project: Project) {
    lateinit var panel: JPanel
        private set
    lateinit var handlerPanel: HandlerPanel
        private set
    lateinit var runtime: JComboBox<LambdaRuntime>
        private set
    lateinit var architecture: JComboBox<LambdaArchitecture>
        private set
    lateinit var timeoutSlider: SliderPanel
        private set
    lateinit var memorySlider: SliderPanel
        private set
    lateinit var environmentVariables: KeyValueTextField
        private set
    lateinit var runtimeModel: SortedComboBoxModel<LambdaRuntime>
        private set
    lateinit var architectureModel: CollectionComboBoxModel<LambdaArchitecture>
        private set

    var lastSelectedRuntime: LambdaRuntime? = null

    private fun createUIComponents() {
        runtimeModel = SortedComboBoxModel(compareBy(Comparator.naturalOrder()) { it.toString() })
        architectureModel = CollectionComboBoxModel(LambdaArchitecture.values().toList())
        runtime = ComboBox(runtimeModel)
        architecture = ComboBox(architectureModel)
        handlerPanel = HandlerPanel(project)
        timeoutSlider = lambdaTimeout()
        memorySlider = lambdaMemory()
        environmentVariables = KeyValueTextField()
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
            handlerPanel.setRuntime(selectedRuntime.toSdkRuntime())
            architectureModel.replaceAll(selectedRuntime.architectures?.toMutableList() ?: mutableListOf(LambdaArchitecture.DEFAULT))
            architecture.isEnabled = architectureModel.size > 1
        }
        val supportedRuntimes = LambdaBuilder.supportedRuntimeGroups().flatMap { it.supportedRuntimes }.sorted()
        runtimeModel.setAll(supportedRuntimes)
        runtimeModel.selectedItem = RuntimeGroup.determineRuntime(project)?.let { if (it in supportedRuntimes) it else null }
    }
}
