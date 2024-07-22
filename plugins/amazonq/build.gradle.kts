// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import software.aws.toolkits.gradle.changelog.tasks.GeneratePluginChangeLog
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

plugins {
    id("toolkit-publishing-conventions")
    id("toolkit-publish-root-conventions")
    id("toolkit-jvm-conventions")
    id("toolkit-testing")
}

val changelog = tasks.register<GeneratePluginChangeLog>("pluginChangeLog") {
    includeUnreleased.set(true)
    changeLogFile.value(layout.buildDirectory.file("changelog/change-notes.xml"))
}

tasks.jar {
    dependsOn(changelog)
    from(changelog) {
        into("META-INF")
    }
}

dependencies {
    intellijPlatform {
        localPlugin(project(":plugin-core"))
    }

    implementation(project(":plugin-amazonq:chat"))
    implementation(project(":plugin-amazonq:codetransform"))
    implementation(project(":plugin-amazonq:codewhisperer"))
    implementation(project(":plugin-amazonq:mynah-ui"))
    implementation(project(":plugin-amazonq:shared"))

    testImplementation(project(":plugin-core"))
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
