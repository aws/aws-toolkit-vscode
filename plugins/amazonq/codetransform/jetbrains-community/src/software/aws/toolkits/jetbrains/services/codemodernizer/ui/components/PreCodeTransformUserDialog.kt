// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.ui.components

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.observable.util.whenItemSelected
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogBuilder
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.COLUMNS_MEDIUM
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toMutableProperty
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeTransformTelemetryManager
import software.aws.toolkits.jetbrains.services.codemodernizer.getSupportedJavaMappings
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CustomerSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.tryGetJdk
import software.aws.toolkits.resources.message
import kotlin.math.max

class PreCodeTransformUserDialog(
    val project: Project,
    val supportedBuildFilesInProject: List<VirtualFile>,
    val supportedJavaMappings: Map<JavaSdkVersion, Set<JavaSdkVersion>>,
) {

    internal data class Model(
        var focusedBuildFileIndex: Int,
        var focusedBuildFile: VirtualFile?,
        var selectedMigrationPath: String?,
        var supportedMigrationPaths: List<String>,
        var focusedBuildFileModule: Module?,
    )

    /**
     * Opens a dialog to user allowing them to select a migration path and details about their project / module.
     */
    fun create(): CustomerSelection? {
        lateinit var dialogPanel: DialogPanel
        lateinit var buildFileComboBox: ComboBox<String>

        val telemetry = CodeTransformTelemetryManager.getInstance(project)
        val buildfiles = supportedBuildFilesInProject
        var focusedModuleIndex = 0
        var chosenBuildFile = buildfiles.firstOrNull()
        val chosenFile = FileEditorManager.getInstance(project).selectedEditor?.file

        // Detect default selection for the build file
        if (chosenFile != null) {
            val focusedModule = ModuleUtil.findModuleForFile(chosenFile, project)
            val matchingBuildFileForChosenModule = buildfiles.find { ModuleUtil.findModuleForFile(it, project) == focusedModule }

            if (focusedModule != null && matchingBuildFileForChosenModule != null) {
                chosenBuildFile = matchingBuildFileForChosenModule
                focusedModuleIndex = max(0, buildfiles.indexOfFirst { it == chosenBuildFile })
            }
        }

        // Detect module for default selected file (if applicable)
        var chosenModule: Module? = null
        if (chosenBuildFile != null) {
            chosenModule = ModuleUtil.findModuleForFile(chosenBuildFile, project)
        }

        // Detect the supported migration path for the module, revert to project default if file not part of module.
        fun supportedJdkForModuleOrProject(module: Module?): List<String> {
            val jdk = if (module != null) {
                getSupportedJavaVersions(module)
            } else {
                project.getSupportedJavaMappings(supportedJavaMappings)
            }
            return jdk.map { it.replace("_", " ") }
        }

        val supportedJavaVersions = supportedJdkForModuleOrProject(chosenModule)

        // Initialize model to hold form data
        val model = Model(
            focusedBuildFileIndex = focusedModuleIndex,
            focusedBuildFile = chosenBuildFile,
            focusedBuildFileModule = chosenModule,
            selectedMigrationPath = supportedJavaVersions.firstOrNull(),
            supportedMigrationPaths = supportedJavaVersions,
        )

        dialogPanel = panel {
            row { text(message("codemodernizer.customerselectiondialog.description.main")) }
            row { text(message("codemodernizer.customerselectiondialog.description.select")) }
            row {
                buildFileComboBox = comboBox(buildfiles.map { it.path })
                    .bind({ it.selectedIndex }, { t, v -> t.selectedIndex = v }, model::focusedBuildFileIndex.toMutableProperty())
                    .align(AlignX.FILL)
                    .columns(COLUMNS_MEDIUM)
                    .component
                buildFileComboBox.whenItemSelected {
                    dialogPanel.apply() // apply user changes to model
                    model.focusedBuildFile = buildfiles[model.focusedBuildFileIndex]
                    model.focusedBuildFileModule = ModuleUtil.findModuleForFile(buildfiles[model.focusedBuildFileIndex], project)
                    model.supportedMigrationPaths = supportedJdkForModuleOrProject(model.focusedBuildFileModule)
                    dialogPanel.reset() // present model changes to user
                }
                buildFileComboBox.addActionListener {
                    telemetry.configurationFileSelectedChanged()
                }
            }
            row {
                this.topGap(TopGap.SMALL)
                text(message("codemodernizer.customerselectiondialog.description.after_module"))
            }
            row {
                text(message("codemodernizer.customerselectiondialog.description.after_module_part2"))
            }
        }

        val builder = DialogBuilder()
        builder.setOkOperation {
            telemetry.jobIsStartedFromUserPopupClick()
            builder.dialogWrapper.close(DialogWrapper.OK_EXIT_CODE)
        }
        builder.addOkAction().setText(message("codemodernizer.customerselectiondialog.ok_button"))
        builder.setCancelOperation {
            telemetry.jobIsCanceledFromUserPopupClick()
            builder.dialogWrapper.close(DialogWrapper.CANCEL_EXIT_CODE)
        }
        builder.addCancelAction()
        builder.setCenterPanel(dialogPanel)
        builder.setTitle(message("codemodernizer.customerselectiondialog.title"))
        if (builder.showAndGet()) {
            val selectedMigrationPath = model.selectedMigrationPath?.replace(" ", "_") ?: throw RuntimeException("Migration path is required")
            val sourceJavaVersion = model.focusedBuildFileModule?.tryGetJdk(project) ?: project.tryGetJdk()
                ?: throw RuntimeException("Unable to detect source language of selected ")
            val targetJavaVersion = JavaSdkVersion.fromVersionString(selectedMigrationPath) ?: throw RuntimeException("Invalid migration path")
            return CustomerSelection(
                model.focusedBuildFile ?: throw RuntimeException("A build file must be selected"),
                sourceJavaVersion,
                targetJavaVersion,
            )
        }
        return null
    }

    private fun getSupportedJavaVersions(module: Module?): List<String> =
        supportedJavaMappings.get(module?.tryGetJdk(project))?.map { it.name } ?: listOf("Unsupported module")
}
