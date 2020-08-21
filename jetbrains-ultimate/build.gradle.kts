// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.IntelliJPluginExtension
import software.aws.toolkits.gradle.IdeVersions

plugins {
    id("org.jetbrains.intellij")
}

dependencies {
    api(project(":jetbrains-core"))
    testImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    integrationTestImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
}

val ideProfile = IdeVersions.ideProfile(project)

intellij {
    val parentIntellijTask = rootProject.intellij
    version = ideProfile.ultimate.sdkVersion
    setPlugins(*ideProfile.ultimate.plugins)
    pluginName = parentIntellijTask.pluginName
    updateSinceUntilBuild = parentIntellijTask.updateSinceUntilBuild
    downloadSources = parentIntellijTask.downloadSources
}

tasks.test {
    systemProperty("log.dir", "${(project.extensions["intellij"] as IntelliJPluginExtension).sandboxDirectory}-test/logs")
}

tasks.jar {
    archiveBaseName.set("aws-intellij-toolkit-ultimate")
}
