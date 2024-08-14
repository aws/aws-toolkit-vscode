// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import software.aws.toolkits.gradle.findFolders
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

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
        // IDE provides Kotlin
        exclude(group = "org.jetbrains.kotlin")
        exclude(group = "org.jetbrains.kotlinx")
    }

    configureEach {
        // IDE provides netty
        exclude("io.netty")

        if (name.startsWith("detekt")) {
            return@configureEach
        }

        // Exclude dependencies that ship with iDE
        exclude(group = "org.slf4j")
        // we want kotlinx-coroutines-debug and kotlinx-coroutines-test
        exclude(group = "org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm")
        exclude(group = "org.jetbrains.kotlinx", "kotlinx-coroutines-core")

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

        // annoying resolution issue that we don't want to bother fixing
        if (!project.name.contains("jetbrains-gateway")) {
            val type = toolkitIntelliJ.ideFlavor.map { IntelliJPlatformType.fromCode(it.toString()) }
            val version = toolkitIntelliJ.version()

            create(type, version, useInstaller = false)
        }

        bundledPlugins(toolkitIntelliJ.productProfile().map { it.bundledPlugins })
        plugins(toolkitIntelliJ.productProfile().map { it.marketplacePlugins })
    }
}

tasks.jar {
    // :plugin-toolkit:jetbrains-community results in: --plugin-toolkit-jetbrains-community-IC-<version>.jar
    archiveBaseName.set(toolkitIntelliJ.ideFlavor.map { "${project.buildTreePath.replace(':', '-')}-$it" })
}

tasks.withType<Test>().configureEach {
    systemProperty("log.dir", intellijPlatform.sandboxContainer.map { "$it-test/logs" }.get())
    systemProperty("testDataPath", project.rootDir.resolve("testdata").absolutePath)
    val jetbrainsCoreTestResources = project(":plugin-toolkit:jetbrains-core").projectDir.resolve("tst-resources")
    systemProperty("idea.log.config.properties.file", jetbrainsCoreTestResources.resolve("toolkit-test-log.properties"))
    systemProperty("org.gradle.project.ideProfileName", ideProfile.name)
}

tasks.withType<JavaExec>().configureEach {
    systemProperty("aws.toolkits.enableTelemetry", false)
}
