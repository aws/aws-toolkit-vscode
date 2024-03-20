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
import software.aws.toolkits.gradle.isCi

val toolkitIntelliJ = project.extensions.create<ToolkitIntelliJExtension>("intellijToolkit")

val ideProfile = IdeVersions.ideProfile(project)
val toolkitVersion: String by project

// please check changelog generation logic if this format is changed
version = "$toolkitVersion-${ideProfile.shortName}"

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("org.jetbrains.intellij")
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

tasks.withType<PatchPluginXmlTask>().all {
    sinceBuild.set(toolkitIntelliJ.ideProfile().map { it.sinceVersion })
    untilBuild.set(toolkitIntelliJ.ideProfile().map { it.untilVersion })
}

// attach the current commit hash on local builds
if (!project.isCi()){
    val buildMetadata = buildMetadata()
    tasks.withType<PatchPluginXmlTask>().all {
        version.set("${project.version}+$buildMetadata")
    }

    tasks.buildPlugin {
        archiveClassifier.set(buildMetadata)
    }
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
        (e.g. :plugin-toolkit:intellij:buildPlugin, :plugin-toolkit:jetbrains-gateway:buildPlugin, :plugin-amazonq:buildPlugin)
    """.trimIndent())
    }
}

tasks.runIde {
    doFirst {
        throwIfSubmodule("""
        The IDE sandbox generated by this task is not an accurate representation of what will be published to the JetBrains Marketplace.
        Please run the task associated with the composite build instead.
        (e.g. :plugin-toolkit:intellij:runIde, :plugin-toolkit:jetbrains-gateway:runIde, :plugin-amazonq:runIde)
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

configurations.instrumentedJar.configure {
    // when the "instrumentedJar" configuration is selected, gradle is unable to resolve configurations needed by jacoco
    // to calculate coverage, so we declare these as seconary artifacts on the primary "instrumentedJar" implicit variant
    outgoing.variants {
        create("instrumentedClasses") {
            attributes {
                attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
                attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.LIBRARY))
                attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL))
                attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE, objects.named(LibraryElements.CLASSES))
            }

            artifact(tasks.instrumentCode) {
                type = ArtifactTypeDefinition.JVM_CLASS_DIRECTORY
            }
        }

        listOf("coverageDataElements", "mainSourceElements").forEach { implicitVariant ->
            val configuration = configurations.getByName(implicitVariant)
            create(implicitVariant) {
                attributes {
                    configuration.attributes.keySet().forEach {
                        attribute(it as Attribute<Any>, configuration.attributes.getAttribute(it)!!)
                    }
                }

                configuration.artifacts.forEach {
                    artifact(it)
                }
            }
        }
    }
}
