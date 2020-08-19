// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.IntelliJPluginExtension
import software.aws.toolkits.gradle.IdeVersions
import software.aws.toolkits.gradle.ProductCode

plugins {
    id("org.jetbrains.intellij")
}

dependencies {
    api(project(":jetbrains-core"))
    testImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    integrationTestImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
}

val ideVersions = IdeVersions(project)

intellij {
    val parentIntellijTask = rootProject.intellij
    version = ideVersions.sdkVersion(ProductCode.IU)
    setPlugins(*ideVersions.plugins(ProductCode.IU).toTypedArray())
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
