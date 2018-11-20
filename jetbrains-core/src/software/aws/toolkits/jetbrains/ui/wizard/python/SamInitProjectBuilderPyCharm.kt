// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.python

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.python.newProject.PyNewProjectSettings
import com.jetbrains.python.newProject.PythonProjectGenerator
import com.jetbrains.python.remote.PyProjectSynchronizer
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.python.PythonRuntimeGroup
import software.aws.toolkits.jetbrains.ui.wizard.SAM_TEMPLATES
import software.aws.toolkits.jetbrains.ui.wizard.SamModuleType
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectTemplate
import software.aws.toolkits.resources.message
import java.io.File

class SamInitProjectBuilderPyCharm : PythonProjectGenerator<PyNewProjectSettings>() {
    val settingsPanel = SamInitDirectoryBasedSettingsPanel(SAM_TEMPLATES, this)

    override fun getName() = SamModuleType.ID

    // "More Options" panel
    override fun getSettingsPanel(baseDir: File?) = settingsPanel.component

    override fun getLogo() = AwsIcons.Resources.SERVERLESS_APP

    override fun validate(baseDirPath: String) = settingsPanel.validate()

    override fun configureProject(project: Project, baseDir: VirtualFile, settings: PyNewProjectSettings, module: Module, synchronizer: PyProjectSynchronizer?) {
        val runtime = PythonRuntimeGroup.determineRuntimeForSdk(settings.sdk
            ?: throw RuntimeException(message("sam.init.python.bad_sdk"))
        ) ?: throw RuntimeException("Could not determine runtime for SDK")

        val template = settingsPanel.templateField.selectedItem as SamProjectTemplate
        template.build(runtime, baseDir)

        super.configureProject(project, baseDir, settings, module, synchronizer)

        runInEdt {
            runWriteAction {
                val rootModel = ModuleRootManager.getInstance(module).modifiableModel
                SamCommon.setSourceRoots(baseDir, project, rootModel)

                rootModel.commit()
            }
        }
    }
}