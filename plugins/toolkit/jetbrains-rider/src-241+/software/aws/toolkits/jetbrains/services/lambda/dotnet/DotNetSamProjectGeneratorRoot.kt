// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.panel
import com.jetbrains.rd.util.lifetime.Lifetime
import com.jetbrains.rider.model.RdProjectTemplate
import com.jetbrains.rider.projectView.projectTemplates.NewProjectDialogContext
import com.jetbrains.rider.projectView.projectTemplates.ProjectTemplatesSharedModel
import com.jetbrains.rider.projectView.projectTemplates.StatusMessageType
import com.jetbrains.rider.projectView.projectTemplates.StatusMessages
import com.jetbrains.rider.projectView.projectTemplates.generators.ProjectTemplateGeneratorBase
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamInitSelectionPanel
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectGenerator
import software.aws.toolkits.jetbrains.utils.DotNetRuntimeUtils
import javax.swing.JComponent

abstract class DotNetSamProjectGeneratorRoot(
    lifetime: Lifetime,
    private val context: NewProjectDialogContext,
    sharedModel: ProjectTemplatesSharedModel
) : ProjectTemplateGeneratorBase(
    lifetime,
    context,
    sharedModel,
    createProject = true
) {
    companion object {
        private const val SAM_HELLO_WORLD_PROJECT_NAME = "HelloWorld"
    }

    override val defaultName = SAM_HELLO_WORLD_PROJECT_NAME

    // TODO: Decouple SamProjectGenerator from the framework wizards so we can re-use its panels
    private val generator = SamProjectGenerator()
    private val samPanel = SamInitSelectionPanel(
        generator.wizardFragments,
        // Only show templates for DotNet in Rider
        runtimeFilter = { RuntimeGroup.getById(BuiltInRuntimeGroups.Dotnet).supportedRuntimes.contains(it) },
        // needed to rerun the validation when the wizard is changed
        wizardUpdateCallback = { validateData() }
    )

    fun getSamPanel() = samPanel

    fun getSamGenerator() = generator

    init {
        /**
         * The project name is generated inside SAM CLI generator and cannot be re-defined via parameters.
         * Hardcode the project name to the generated one - "HelloWorld".
         */
        projectNameProperty.set(SAM_HELLO_WORLD_PROJECT_NAME)
        sameDirectoryProperty.set(false)

        initSamPanel()
    }

    override fun getComponent(): JComponent {
        val component = super.getComponent()
        projectNameTextField?.component?.isEnabled = false
        sameDirectoryCheckbox?.component?.isEnabled = false
        return component
    }

    override fun createTemplateSpecificPanel(): DialogPanel {
        val panel = panel { row { cell(samPanel.mainPanel).align(Align.FILL).resizableColumn() }.resizableRow() }
        validateData()
        return panel
    }

    override fun checkIsAbleToExpand(template: RdProjectTemplate?, validations: Map<JComponent, ValidationInfo>) {
        // we don't care about template here.
        canExpand.set(validations.isEmpty())
    }

    private fun validateData() {
        // first validateData comes from SamInitSelectionPanel constructor, so is null...
        @Suppress("UNNECESSARY_SAFE_CALL")
        samPanel?.validate()?.let {
            context.statusMessages.add(StatusMessages.Error(it.message))
            return
        }
        context.statusMessages.removeIf { it.type == StatusMessageType.Error }
    }

    private fun initSamPanel() {
        samPanel.setRuntime(DotNetRuntimeUtils.getCurrentDotNetCoreRuntime())
    }
}
