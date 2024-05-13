// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.gradle.internal.os.OperatingSystem
import org.gradle.testing.jacoco.plugins.JacocoTaskExtension.Output
import org.jetbrains.intellij.tasks.DownloadRobotServerPluginTask
import org.jetbrains.intellij.tasks.PatchPluginXmlTask
import org.jetbrains.intellij.tasks.RunIdeForUiTestTask
import org.jetbrains.intellij.utils.OpenedPackages
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
    id("org.jetbrains.intellij")
    id("toolkit-patch-plugin-xml-conventions")
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
intellij {
    // find the name of first subproject depth, or root if not applied to a subproject hierarchy
    val projectName = generateSequence(project) { it.parent }.first { it.depth <= 1 }.name
    pluginName.convention(projectName)

    localPath.set(toolkitIntelliJ.localPath())
    version.set(toolkitIntelliJ.version())

    plugins.set(toolkitIntelliJ.productProfile().map { it.plugins.toMutableList() })

    downloadSources.set(toolkitIntelliJ.ideFlavor.map { it == IdeFlavor.IC && !project.isCi() })
    instrumentCode.set(toolkitIntelliJ.ideFlavor.map { it == IdeFlavor.IC || it == IdeFlavor.IU })
}

tasks.jar {
    // :plugin-toolkit:jetbrains-community results in: --plugin-toolkit-jetbrains-community-IC-<version>.jar
    archiveBaseName.set(toolkitIntelliJ.ideFlavor.map { "${project.buildTreePath.replace(':', '-')}-$it" })
}

// Disable building the settings search cache since it 1. fails the build, 2. gets run on the final packaged plugin
tasks.buildSearchableOptions {
    enabled = false
}

// https://github.com/JetBrains/gradle-intellij-plugin/blob/829786d5d196ab942d7e6eb3e472ac0af776d3fa/src/main/kotlin/org/jetbrains/intellij/tasks/RunIdeBase.kt#L315
val openedPackages = OpenedPackages + with(OperatingSystem.current()) {
    when {
        isWindows -> listOf(
            "--add-opens=java.base/sun.nio.fs=ALL-UNNAMED",
        )
        else -> emptyList()
    }
}

tasks.withType<Test>().all {
    systemProperty("log.dir", intellij.sandboxDir.map { "$it-test/logs" }.get())
    systemProperty("testDataPath", project.rootDir.resolve("testdata").absolutePath)
    val jetbrainsCoreTestResources = project(":plugin-toolkit:jetbrains-core").projectDir.resolve("tst-resources")
    systemProperty("idea.log.config.properties.file", jetbrainsCoreTestResources.resolve("toolkit-test-log.properties"))
    systemProperty("org.gradle.project.ideProfileName", ideProfile.name)
    systemProperty("aws.dev.useDAG", true)

    jvmArgs(openedPackages)
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

    val alternativeIde = providers.environmentVariable("ALTERNATIVE_IDE")
    if (alternativeIde.isPresent) {
        // remove the trailing slash if there is one or else it will not work
        val value = alternativeIde.get()
        val path = File(value.trimEnd('/'))
        if (path.exists()) {
            ideDir.set(path)
        } else {
            throw GradleException("ALTERNATIVE_IDE path not found $value")
        }
    }
}

// rewrite `runtimeElements` to use the `instrumentedJar` variant
// there should never be a reason to use the default artifact at runtime, but `testFixturesRuntimeElements` pulls in `runtimeElements`
// which is causing conflict between the `runtimeElements` and `instrumentedJar` variants
// additionally more cleanly solves another headache from the IDE defaulting to instrumented classes while navigating between modules
configurations.runtimeElements {
    // remove the default artifact and replace with the instrumented jar
    outgoing.artifacts.clear()
    outgoing.artifacts(configurations.instrumentedJar.map { it.artifacts })

    // replace default classes with instrumented classes
    outgoing.variants {
        get("classes").apply {
            artifacts.clear()
            artifact(tasks.instrumentCode) {
                type = ArtifactTypeDefinition.JVM_CLASS_DIRECTORY
            }
        }
    }
}

// 1.x declares dependsOn, but we want mustRunAfter
// https://github.com/JetBrains/intellij-platform-gradle-plugin/blob/47e2de88e86ffdefd3f6f45c2bb3181366ee4fa4/src/main/kotlin/org/jetbrains/intellij/IntelliJPlugin.kt#L1702
tasks.classpathIndexCleanup {
    dependsOn.clear()

    project.tasks
        .runCatching { named("compileTestKotlin") }
        .onSuccess { mustRunAfter(it) }
}
