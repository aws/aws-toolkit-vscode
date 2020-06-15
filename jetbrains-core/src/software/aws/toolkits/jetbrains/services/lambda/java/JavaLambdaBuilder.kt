// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.externalSystem.ExternalSystemModulePropertyManager
import com.intellij.openapi.externalSystem.util.ExternalSystemApiUtil
import com.intellij.openapi.module.Module
import com.intellij.openapi.projectRoots.JavaSdkType
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import org.jetbrains.idea.maven.project.MavenProjectsManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.resources.message

class JavaLambdaBuilder : LambdaBuilder() {
    override fun baseDirectory(module: Module, handlerElement: PsiElement): String =
        when {
            isGradle(module) -> getGradleProjectLocation(module)
            isMaven(module) -> getPomLocation(module)
            else -> throw IllegalStateException(message("lambda.build.java.unsupported_build_system", module.name))
        }

    override fun additionalEnvironmentVariables(module: Module, samOptions: SamOptions): Map<String, String> {
        if (samOptions.buildInContainer) {
            return emptyMap()
        }

        val sdk = ModuleRootManager.getInstance(module).sdk ?: return emptyMap()
        val sdkHome = sdk.homePath ?: return emptyMap()

        return if (sdk.sdkType is JavaSdkType) {
            mapOf("JAVA_HOME" to FileUtil.toSystemDependentName(sdkHome))
        } else {
            emptyMap()
        }
    }

    private fun isGradle(module: Module): Boolean = ExternalSystemModulePropertyManager.getInstance(module)
        .getExternalSystemId() == "GRADLE"

    private fun getGradleProjectLocation(module: Module): String =
        ExternalSystemApiUtil.getExternalProjectPath(module)
            ?: throw IllegalStateException(message("lambda.build.unable_to_locate_project_root", module))

    private fun isMaven(module: Module): Boolean {
        if (PluginManager.getPlugin(PluginId.getId("org.jetbrains.idea.maven"))?.isEnabled == true) {
            return MavenProjectsManager.getInstance(module.project).isMavenizedModule(module)
        }

        return false
    }

    private fun getPomLocation(module: Module): String =
        MavenProjectsManager.getInstance(module.project).findProject(module)?.directory ?: throw IllegalStateException(
            message("lambda.build.unable_to_locate_project_root", module)
        )
}
