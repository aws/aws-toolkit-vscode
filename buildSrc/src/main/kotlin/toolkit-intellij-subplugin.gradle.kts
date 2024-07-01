// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.gradle.internal.os.OperatingSystem
import org.gradle.testing.jacoco.plugins.JacocoTaskExtension.Output
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.PatchPluginXmlTask
import software.aws.toolkits.gradle.buildMetadata
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.findFolders
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ
import software.aws.toolkits.gradle.isCi

val ideProfile = IdeVersions.ideProfile(project)

plugins {
    id("toolkit-intellij-plugin")
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
}

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")

// Add our source sets per IDE profile version (i.e. src-211)
sourceSets {
    main {
        java.srcDirs(findFolders(project, "src", ideProfile))
        resources.srcDirs(findFolders(project, "resources", ideProfile))
    }
    test {
        java.srcDirs(findFolders(project, "tst", ideProfile))
        resources.srcDirs(findFolders(project, "tst-resources", ideProfile))
    }
}

configurations {
    runtimeClasspath {
        // Exclude dependencies that ship with iDE
        exclude(group = "org.slf4j")
        exclude(group = "org.jetbrains.kotlin")
        exclude(group = "org.jetbrains.kotlinx")
    }

    all {
        // IDE provides netty
        exclude("io.netty")

        if (name.startsWith("detekt")) {
            return@all
        }

        resolutionStrategy.eachDependency {
            if (requested.group == "org.jetbrains.kotlinx" && requested.name.startsWith("kotlinx-coroutines")) {
                useVersion(versionCatalog.findVersion("kotlinCoroutines").get().toString())
                because("resolve kotlinx-coroutines version conflicts in favor of local version catalog")
            }

            if (requested.group == "org.jetbrains.kotlin" && requested.name.startsWith("kotlin")) {
                useVersion(versionCatalog.findVersion("kotlin").get().toString())
                because("resolve kotlin version conflicts in favor of local version catalog")
            }
        }
    }
}

tasks.processResources {
    // needed because both rider and ultimate include plugin-datagrip.xml which we are fine with
    duplicatesStrategy = DuplicatesStrategy.WARN
}

tasks.processTestResources {
    // TODO how can we remove this
    duplicatesStrategy = DuplicatesStrategy.WARN
}

// Run after the project has been evaluated so that the extension (intellijToolkit) has been configured
intellijPlatform {
    // find the name of first subproject depth, or root if not applied to a subproject hierarchy
    projectName.convention(generateSequence(project) { it.parent }.first { it.depth <= 1 }.name)
    instrumentCode = true
}

dependencies {
    intellijPlatform {
        instrumentationTools()

        // annoying resolution issue that we dont wan't to bother fixing
        if (!project.name.contains("jetbrains-gateway")) {
            val type = toolkitIntelliJ.ideFlavor.map { IntelliJPlatformType.fromCode(it.toString()) }
            val version = toolkitIntelliJ.version()

            create(type, version)
        }

        jetbrainsRuntime()
        bundledPlugins(toolkitIntelliJ.productProfile().map { it.bundledPlugins })
        plugins(toolkitIntelliJ.productProfile().map { it.marketplacePlugins })
    }

    // FIX_WHEN_MIN_IS_233: something weird with dependency transform in 232-only (pulling in 13.0?) but doesn't worth investigating at the moment
    if (providers.gradleProperty("ideProfileName").getOrNull() == "2023.2") {
        compileOnly("org.jetbrains:annotations:24.0.0")
    }
}

tasks.jar {
    // :plugin-toolkit:jetbrains-community results in: --plugin-toolkit-jetbrains-community-IC-<version>.jar
    archiveBaseName.set(toolkitIntelliJ.ideFlavor.map { "${project.buildTreePath.replace(':', '-')}-$it" })
}

// Disable building the settings search cache since it 1. fails the build, 2. gets run on the final packaged plugin
tasks.buildSearchableOptions {
    enabled = false
}

tasks.withType<Test>().all {
    systemProperty("log.dir", intellijPlatform.sandboxContainer.map { "$it-test/logs" }.get())
    systemProperty("testDataPath", project.rootDir.resolve("testdata").absolutePath)
    val jetbrainsCoreTestResources = project(":plugin-toolkit:jetbrains-core").projectDir.resolve("tst-resources")
    systemProperty("idea.log.config.properties.file", jetbrainsCoreTestResources.resolve("toolkit-test-log.properties"))
    systemProperty("org.gradle.project.ideProfileName", ideProfile.name)
}

tasks.withType<JavaExec> {
    systemProperty("aws.toolkits.enableTelemetry", false)
}

private fun throwIfSubmodule(message: String) {
    if (project.depth > 1 && !project.name.contains("gateway")) {
        throw GradleException(message)
    }
}

tasks.buildPlugin {
    doFirst {
        throwIfSubmodule("""
        The build generated by this task is not an accurate representation of what will be published to the JetBrains Marketplace.
        Please run the task associated with the composite build instead.
        (e.g. :plugin-toolkit:intellij-standalone:buildPlugin, :plugin-toolkit:jetbrains-gateway:buildPlugin, :plugin-amazonq:buildPlugin)
    """.trimIndent())
    }
}

tasks.runIde {
    doFirst {
        throwIfSubmodule("""
        The IDE sandbox generated by this task is not an accurate representation of what will be published to the JetBrains Marketplace.
        Please run the task associated with the composite build instead.
        (e.g. :plugin-toolkit:intellij-standalone:runIde, :plugin-toolkit:jetbrains-gateway:runIde, :plugin-amazonq:runIde)
    """.trimIndent())
    }

    systemProperty("aws.toolkit.developerMode", true)
    systemProperty("ide.plugins.snapshot.on.unload.fail", true)
    systemProperty("memory.snapshots.path", project.rootDir)
    systemProperty("idea.auto.reload.plugins", false)
}
