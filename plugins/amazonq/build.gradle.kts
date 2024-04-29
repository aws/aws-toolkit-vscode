// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.changelog.tasks.GeneratePluginChangeLog
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions

plugins {
    id("toolkit-publishing-conventions")
    id("toolkit-patch-plugin-xml-conventions")
}

val changelog = tasks.register<GeneratePluginChangeLog>("pluginChangeLog") {
    includeUnreleased.set(true)
    changeLogFile.set(project.file("$buildDir/changelog/change-notes.xml"))
}

tasks.jar {
    dependsOn(changelog)
    from(changelog) {
        into("META-INF")
    }
}

intellij {
    plugins.set(
        listOf(
            project(":plugin-core")
        )
    )
}

dependencies {
    implementation(project(":plugin-amazonq:chat"))
    implementation(project(":plugin-amazonq:codetransform"))
    implementation(project(":plugin-amazonq:codewhisperer"))
    implementation(project(":plugin-amazonq:mynah-ui"))
    implementation(project(":plugin-amazonq:shared"))
}

val moduleOnlyJar = tasks.create<Jar>("moduleOnlyJar") {
    archiveClassifier.set("module-only")
    // empty jar
}

val moduleOnlyJars by configurations.creating {
    isCanBeConsumed = true
    isCanBeResolved = false
    // If you want this configuration to share the same dependencies, otherwise omit this line
    extendsFrom(configurations["implementation"], configurations["runtimeOnly"])
}

artifacts {
    add("moduleOnlyJars", moduleOnlyJar)
}

tasks.check {
    val serviceSubdirs = project(":plugin-amazonq").subprojects
    serviceSubdirs.forEach { serviceSubDir ->
        val subDirs = serviceSubDir.subprojects
        subDirs.forEach { insideService->
            dependsOn(":plugin-amazonq:${serviceSubDir.name}:${insideService.name}:check")
        }

    }

}
