// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.java

import com.intellij.ide.projectWizard.ProjectTemplateList
import com.intellij.ide.util.projectWizard.ModuleBuilder
import com.intellij.ide.util.projectWizard.ModuleWizardStep
import com.intellij.ide.util.projectWizard.WizardContext
import com.intellij.openapi.Disposable
import com.intellij.openapi.module.JavaModuleType
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.roots.ui.configuration.ModulesProvider
import com.intellij.ui.IdeBorderFactory
import com.intellij.uiDesigner.core.GridConstraints
import com.jetbrains.python.module.PythonModuleType
import com.jetbrains.python.sdk.PythonSdkType
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.ui.wizard.SAM_TEMPLATES
import software.aws.toolkits.jetbrains.ui.wizard.SamModuleType
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectTemplateWrapper
import software.aws.toolkits.resources.message
import java.awt.GridLayout
import javax.swing.JPanel

class SamInitModuleBuilder : ModuleBuilder() {
    var runtime: Runtime? = null
    lateinit var runtimeSelectionPanel: SamInitRuntimeSelectionPanel
    lateinit var template: SamProjectTemplateWrapper

    /*  Trick IDEA to give us a custom first screen without using the WizardDelegate trick
        described in AndroidModuleBuilder
        https://github.com/JetBrains/android/blob/master/android/src/com/android/tools/idea/npw/ideahost/AndroidModuleBuilder.java
    */
    override fun getModuleType() = SamModuleType.instance

    // we want to use our own custom template selection step
    override fun isTemplateBased() = false

    fun getIdeaModuleType() = when (runtime?.runtimeGroup) {
        RuntimeGroup.JAVA -> JavaModuleType.getModuleType()
        RuntimeGroup.PYTHON -> PythonModuleType.getInstance()
        else -> ModuleType.EMPTY
    }

    fun getSdkType() = when (runtime?.runtimeGroup) {
        RuntimeGroup.JAVA -> JavaSdk.getInstance()
        RuntimeGroup.PYTHON -> PythonSdkType.getInstance()
        else -> JavaSdk.getInstance()
    }

    override fun setupRootModel(rootModel: ModifiableRootModel) {
        if (myJdk != null) {
            rootModel.sdk = myJdk
        } else {
            rootModel.inheritSdk()
        }
        rootModel.module.rootManager.modifiableModel.inheritSdk()
        val moduleType = getIdeaModuleType().id
        rootModel.module.setModuleType(moduleType)
        val project = rootModel.project

        template.samProjectTemplate.build(runtime ?: throw RuntimeException(message("sam.init.null_runtime")), project.baseDir)
        rootModel.addContentEntry(project.baseDir)

        SamCommon.excludeSamDirectory(rootModel.project.baseDir, rootModel)

        if (rootModel.sdk?.sdkType is PythonSdkType) {
            SamCommon.setSourceRoots(rootModel.project.baseDir, rootModel.project, rootModel)
        }
        // don't commit because it will be done for us
    }

    override fun getPresentableName() = SamModuleType.ID

    override fun getDescription() = SamModuleType.DESCRIPTION

    override fun getNodeIcon() = AwsIcons.Resources.SERVERLESS_APP

    override fun getCustomOptionsStep(context: WizardContext?, parentDisposable: Disposable?): ModuleWizardStep? {
        runtimeSelectionPanel = SamInitRuntimeSelectionPanel(this, context)
        return runtimeSelectionPanel
    }

    override fun createWizardSteps(wizardContext: WizardContext, modulesProvider: ModulesProvider) =
            arrayOf(SamInitTemplateSelectionStep(this, wizardContext))
}

class SamInitTemplateSelectionStep(
    val builder: SamInitModuleBuilder,
    val context: WizardContext
) : ModuleWizardStep() {
    val templateSelectionPanel = ProjectTemplateList()
    private val parentPanel = JPanel(GridLayout(0, 1))

    init {
        templateSelectionPanel.setTemplates(SAM_TEMPLATES.map { it.getModuleBuilderProjectTemplate(builder) }, true)
        templateSelectionPanel.border = IdeBorderFactory.createTitledBorder(message("sam.init.select_sam_template_step_label"), false)
        parentPanel.add(templateSelectionPanel, GridConstraints())
    }

    override fun updateDataModel() {
        context.projectBuilder = builder
        builder.template = templateSelectionPanel.selectedTemplate as SamProjectTemplateWrapper
    }

    override fun getComponent() = parentPanel
}