// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import java.nio.file.Paths

/**
 * Used to manage SAM project information for different [RuntimeGroup]s
 */
interface SamProjectWizard {
    /**
     * Return a collection of templates supported by the [RuntimeGroup]
     */
    fun listTemplates(): Collection<SamProjectTemplate>

    /**
     * Return an instance of UI section for selecting SDK for the [RuntimeGroup]
     */
    fun createSdkSelectionPanel(projectLocation: TextFieldWithBrowseButton?): SdkSelector?

    companion object : RuntimeGroupExtensionPointObject<SamProjectWizard>(ExtensionPointName("aws.toolkit.lambda.sam.projectWizard"))
}

data class SamNewProjectSettings(
    val template: SamProjectTemplate,
    val runtime: LambdaRuntime,
    val architecture: LambdaArchitecture,
    val packagingType: PackageType
)

abstract class SamProjectTemplate {
    abstract fun displayName(): String

    open fun description(): String? = null

    override fun toString() = displayName()

    abstract fun supportedZipRuntimes(): Set<LambdaRuntime>

    abstract fun supportedImageRuntimes(): Set<LambdaRuntime>

    // Gradual opt-in for Schema support on a template by-template basis.
    // All SAM templates should support schema selection, but for launch include only EventBridge for most optimal customer experience
    open fun supportsDynamicSchemas(): Boolean = false

    abstract fun templateParameters(
        projectName: String,
        runtime: LambdaRuntime,
        architecture: LambdaArchitecture,
        packagingType: PackageType
    ): TemplateParameters

    open fun postCreationAction(
        settings: SamNewProjectSettings,
        contentRoot: VirtualFile,
        rootModel: ModifiableRootModel,
        indicator: ProgressIndicator
    ) {
        excludeSamDirectory(rootModel, contentRoot)
    }

    protected fun addSourceRoots(project: Project, modifiableModel: ModifiableRootModel, projectRoot: VirtualFile) {
        val template = SamCommon.getTemplateFromDirectory(projectRoot) ?: return
        val templatePath = Paths.get(template.parent.path)
        runInEdt {
            val functions = SamTemplateUtils.findFunctionsFromTemplate(project, template)
            val functionLocations = functions.map {
                val codeLocation = SamTemplateUtils.getCodeLocation(template.toNioPath().toAbsolutePath(), it.logicalName)
                templatePath.parent.resolve(codeLocation)
            }

            val localFileSystem = LocalFileSystem.getInstance()
            val function = functionLocations.mapNotNull { localFileSystem.refreshAndFindFileByIoFile(it.toFile()) }
                .filter { it.isDirectory }

            modifiableModel.contentEntries.forEach { contentEntry ->
                if (contentEntry.file == projectRoot) {
                    function.forEach { contentEntry.addSourceFolder(it, false) }
                }
            }
        }
    }

    private fun excludeSamDirectory(modifiableModel: ModifiableRootModel, projectRoot: VirtualFile) {
        modifiableModel.contentEntries.forEach { contentEntry ->
            if (contentEntry.file == projectRoot) {
                contentEntry.addExcludeFolder(
                    VfsUtilCore.pathToUrl(
                        Paths.get(projectRoot.path, SamCommon.SAM_BUILD_DIR).toString()
                    )
                )
            }
        }
    }

    // defined so that we can restore the template selection when the runtime selection changes
    override fun equals(other: Any?) = if (other is SamProjectTemplate) {
        displayName() == other.displayName()
    } else {
        false
    }

    override fun hashCode() = displayName().hashCode()

    companion object {
        // Dont cache this since it is not compatible in a dynamic plugin world / waste memory if no longer needed
        fun supportedTemplates() = SamProjectWizard.supportedRuntimeGroups().flatMap {
            SamProjectWizard.getInstance(it).listTemplates()
        }
    }
}

abstract class SamAppTemplateBased : SamProjectTemplate() {
    abstract val dependencyManager: String
    abstract val appTemplateName: String
    open val appTemplateNameImage: String = "hello-world-lambda-image"

    override fun templateParameters(
        projectName: String,
        runtime: LambdaRuntime,
        architecture: LambdaArchitecture,
        packagingType: PackageType
    ): TemplateParameters = when (packagingType) {
        PackageType.IMAGE -> AppBasedImageTemplate(
            name = projectName,
            baseImage = "amazon/$runtime-base",
            architecture = architecture,
            dependencyManager = dependencyManager,
            appTemplate = appTemplateNameImage
        )
        PackageType.ZIP -> AppBasedZipTemplate(
            name = projectName,
            runtime = runtime,
            architecture = architecture,
            dependencyManager = dependencyManager,
            appTemplate = appTemplateName
        )
        else -> throw IllegalStateException("Unknown packaging type: $packagingType")
    }
}
