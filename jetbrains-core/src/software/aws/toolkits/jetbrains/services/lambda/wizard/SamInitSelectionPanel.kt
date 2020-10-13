// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.layout.panel
import com.intellij.util.text.SemVer
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance.BadExecutable
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType.Companion.getExecutable
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup.Companion.find
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextField

class SamInitSelectionPanel(
    wizardFragmentList: List<WizardFragment>,
    private val projectLocation: TextFieldWithBrowseButton? = null, /* Only available in PyCharm! */
    runtimeFilter: (Runtime) -> Boolean = { true }
) {
    lateinit var mainPanel: JPanel
    private lateinit var runtimeComboBox: ComboBox<Runtime>
    private lateinit var samExecutableField: JTextField
    private lateinit var editSamExecutableButton: JButton
    private lateinit var samLabel: JBLabel
    private lateinit var templateComboBox: ComboBox<SamProjectTemplate>
    private lateinit var fragments: Wrapper

    private val wizardFragments: Map<WizardFragment, JComponent>

    init {
        // Source all templates, find all the runtimes they support, then filter those by what the IDE supports
        val supportedRuntimeGroups = RuntimeGroup.registeredRuntimeGroups()
        SamProjectTemplate.supportedTemplates().asSequence()
            .flatMap { it.supportedRuntimes().asSequence() }
            .filter(runtimeFilter)
            .filter { supportedRuntimeGroups.contains(find { runtimeGroup -> runtimeGroup.runtimes.contains(it) }) }
            .distinct()
            .sorted()
            .forEach { runtimeComboBox.addItem(it) }

        setupSamSelectionElements(samExecutableField, editSamExecutableButton, samLabel)

        runtimeComboBox.addActionListener {
            runtimeUpdate()
            wizardUpdate()
        }

        templateComboBox.addActionListener { wizardUpdate() }
        templateComboBox.renderer = SimpleListCellRenderer.create { label, value, _ ->
            label.text = value?.displayName()
            label.toolTipText = value?.description()
        }

        wizardFragments = wizardFragmentList.associateWith {
            val panel = JPanel(BorderLayout())
            val fragmentTitle = it.title()
            if (fragmentTitle != null) {
                panel.border = IdeBorderFactory.createTitledBorder(it.title(), false)
            }
            panel.add(it.component(), BorderLayout.CENTER)
            panel
        }

        fragments.setContent(
            panel {
                wizardFragments.values.forEach {
                    row() {
                        it(grow)
                    }
                }
            }
        )

        runtimeUpdate()
        wizardUpdate()
    }

    fun setRuntime(runtime: Runtime) {
        runtimeComboBox.selectedItem = runtime
    }

    private fun runtimeUpdate() {
        val selectedRuntime = runtimeComboBox.selectedItem as? Runtime
        templateComboBox.removeAllItems()

        // if selected runtimeComboBox is null, we're on an unsupported platform
        if (selectedRuntime == null) {
            return
        }
        SamProjectTemplate.supportedTemplates()
            .filter { it.supportedRuntimes().contains(selectedRuntime) }
            .forEach { templateComboBox.addItem(it) }
    }

    private fun wizardUpdate() {
        val selectedRuntime = runtimeComboBox.selectedItem as? Runtime
        val selectedTemplate = templateComboBox.selectedItem as? SamProjectTemplate
        wizardFragments.forEach { wizardFragment, jComponent ->
            wizardFragment.updateUi(projectLocation, selectedRuntime, selectedTemplate)
            jComponent.isVisible = wizardFragment.isApplicable(selectedTemplate)
        }
    }

    fun validate(): ValidationInfo? {
        val samExecutable = ExecutableManager.getInstance().getExecutableIfPresent(getExecutable(SamExecutable::class.java))
        if (samExecutable is BadExecutable) {
            return ValidationInfo(samExecutable.validationError, samExecutableField)
        }

        // TODO: Why does this have no validation on it?
        val selectedRuntime = runtimeComboBox.selectedItem as? Runtime
        if (selectedRuntime != null) {
            try {
                val samVersion = SemVer.parseFromText(samExecutable.version)!!
                val runtimeGroup = selectedRuntime.runtimeGroup!!
                runtimeGroup.validateSamVersion(selectedRuntime, samVersion)
            } catch (e: Exception) {
                return ValidationInfo(e.message!!, runtimeComboBox)
            }
        }

        // TODO: Why does this have no validation on it?
        val samProjectTemplate = templateComboBox.selectedItem as? SamProjectTemplate

        return wizardFragments.keys
            .filter { it.isApplicable(samProjectTemplate) }
            .mapNotNull { it.validateFragment() }
            .firstOrNull()
    }

    fun getNewProjectSettings(): SamNewProjectSettings {
        val lambdaRuntime = runtimeComboBox.selectedItem as? Runtime
            ?: throw RuntimeException("No Runtime is supported in this Platform.")
        val samProjectTemplate = templateComboBox.selectedItem as? SamProjectTemplate
            ?: throw RuntimeException("No SAM template is supported for this runtime: $lambdaRuntime")

        return SamNewProjectSettings(lambdaRuntime, samProjectTemplate)
    }
}
