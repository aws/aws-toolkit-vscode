// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.PlatformUtils
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.wizard.IntelliJSdkSelectionPanel
import software.aws.toolkits.jetbrains.services.lambda.wizard.LocationBasedTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamAppTemplateBased
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamNewProjectSettings
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectWizard
import software.aws.toolkits.jetbrains.services.lambda.wizard.SdkSelector
import software.aws.toolkits.jetbrains.services.lambda.wizard.TemplateParameters
import software.aws.toolkits.resources.message

private val pythonTemplateRuntimes = setOf(Runtime.PYTHON2_7, Runtime.PYTHON3_6, Runtime.PYTHON3_7, Runtime.PYTHON3_8)

class PythonSamProjectWizard : SamProjectWizard {
    override fun createSdkSelectionPanel(projectLocation: TextFieldWithBrowseButton?): SdkSelector? = when {
        PlatformUtils.isIntelliJ() -> IntelliJSdkSelectionPanel(BuiltInRuntimeGroups.Python)
        else -> PyCharmSdkSelectionPanel(projectLocation)
    }

    override fun listTemplates(): Collection<SamProjectTemplate> = listOf(
        SamHelloWorldPython(),
        SamDynamoDBCookieCutter(),
        SamEventBridgeHelloWorld(),
        SamEventBridgeStarterApp()
    )
}

abstract class PythonSamProjectTemplate : SamAppTemplateBased() {
    override fun supportedRuntimes() = pythonTemplateRuntimes

    override val dependencyManager: String = "pip"

    override fun postCreationAction(
        settings: SamNewProjectSettings,
        contentRoot: VirtualFile,
        rootModel: ModifiableRootModel,
        indicator: ProgressIndicator
    ) {
        super.postCreationAction(settings, contentRoot, rootModel, indicator)
        addSourceRoots(rootModel.project, rootModel, contentRoot)
    }
}

class SamHelloWorldPython : PythonSamProjectTemplate() {
    override fun displayName() = message("sam.init.template.hello_world.name")

    override fun description() = message("sam.init.template.hello_world.description")

    override fun supportedPackagingTypes(): Set<PackageType> = setOf(PackageType.IMAGE, PackageType.ZIP)

    override val appTemplateName: String = "hello-world"
}

class SamDynamoDBCookieCutter : SamProjectTemplate() {
    override fun displayName() = message("sam.init.template.dynamodb_cookiecutter.name")

    override fun description() = message("sam.init.template.dynamodb_cookiecutter.description")

    override fun supportedRuntimes() = pythonTemplateRuntimes

    override fun postCreationAction(
        settings: SamNewProjectSettings,
        contentRoot: VirtualFile,
        rootModel: ModifiableRootModel,
        indicator: ProgressIndicator
    ) {
        super.postCreationAction(settings, contentRoot, rootModel, indicator)
        addSourceRoots(rootModel.project, rootModel, contentRoot)
    }

    override fun templateParameters(projectName: String, runtime: Runtime, packagingType: PackageType): TemplateParameters = LocationBasedTemplate(
        "gh:aws-samples/cookiecutter-aws-sam-dynamodb-python"
    )
}

class SamEventBridgeHelloWorld : PythonSamProjectTemplate() {
    override fun supportedRuntimes() = setOf(Runtime.PYTHON3_6, Runtime.PYTHON3_7, Runtime.PYTHON3_8)

    override fun displayName() = message("sam.init.template.event_bridge_hello_world.name")

    override fun description() = message("sam.init.template.event_bridge_hello_world.description")

    override val appTemplateName: String = "eventBridge-hello-world"
}

class SamEventBridgeStarterApp : PythonSamProjectTemplate() {
    override fun supportedRuntimes() = setOf(Runtime.PYTHON3_6, Runtime.PYTHON3_7, Runtime.PYTHON3_8)

    override fun displayName() = message("sam.init.template.event_bridge_starter_app.name")

    override fun description() = message("sam.init.template.event_bridge_starter_app.description")

    override val appTemplateName: String = "eventBridge-schema-app"

    override fun supportsDynamicSchemas(): Boolean = true
}
