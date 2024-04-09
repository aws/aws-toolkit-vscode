// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.utils

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import org.jetbrains.idea.maven.project.MavenProjectsManager
import org.jetbrains.plugins.gradle.settings.GradleSettings

fun isIntellij(): Boolean {
    val productCode = ApplicationInfo.getInstance().build.productCode
    return productCode == "IC" || productCode == "IU"
}

fun isGradleProject(project: Project) = !GradleSettings.getInstance(project).linkedProjectsSettings.isEmpty()

fun getJavaVersionFromProjectSetting(project: Project): String? = project.tryGetJdk()?.toString()

fun getMavenVersion(project: Project): String {
    val mavenSettings = MavenProjectsManager.getInstance(project).getGeneralSettings()
    // should be set to "Bundled (Maven X)" if setup instructions were followed
    return mavenSettings.getMavenHome() ?: "Unknown"
}
