// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
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
    val runtime: Runtime,
    val template: SamProjectTemplate
)

abstract class SamProjectTemplate {
    abstract fun displayName(): String

    open fun description(): String? = null

    override fun toString() = displayName()

    abstract fun templateParameters(projectName: String, runtime: Runtime): TemplateParameters

    abstract fun supportedRuntimes(): Set<Runtime>

    // Gradual opt-in for Schema support on a template by-template basis.
    // All SAM templates should support schema selection, but for launch include only EventBridge for most optimal customer experience
    open fun supportsDynamicSchemas(): Boolean = false

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
        val codeUris = SamCommon.getCodeUrisFromTemplate(project, template)
        modifiableModel.contentEntries.forEach { contentEntry ->
            if (contentEntry.file == projectRoot) {
                codeUris.forEach { contentEntry.addSourceFolder(it, false) }
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

    companion object {
        // Dont cache this since it is not compatible in a dynamic plugin world / waste memory if no longer needed
        fun supportedTemplates() = SamProjectWizard.supportedRuntimeGroups().flatMap {
            SamProjectWizard.getInstance(it).listTemplates()
        }
    }
}
