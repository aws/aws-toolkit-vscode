// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import groovy.lang.Closure
import org.jetbrains.intellij.IntelliJPluginExtension

apply(from = "../intellijJVersions.gradle")
apply(plugin = "org.jetbrains.intellij")

val ideSdkVersion: Closure<String> by ext
val idePlugins: Closure<ArrayList<String>> by ext

dependencies {
    api(project(":jetbrains-core"))
    testImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    integrationTestImplementation(project(path = ":jetbrains-core", configuration = "testArtifacts"))
}

extensions.configure<IntelliJPluginExtension>("intellij") {
    val parentIntellijTask = project(":jetbrains-core").extensions["intellij"] as IntelliJPluginExtension
    version = ideSdkVersion("IU")
    setPlugins(*(idePlugins("IU").toArray()))
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
