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
val remoteRobotPort: String by project

// please check changelog generation logic if this format is changed
version = "$toolkitVersion-${ideProfile.shortName}"

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("org.jetbrains.intellij")
}

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

        // Exclude dependencies we don't use to make plugin smaller
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }

    testRuntimeClasspath {
        // Conflicts with CRT in test classpath
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }

    // TODO: https://github.com/gradle/gradle/issues/15383
    val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
    dependencies {
        testImplementation(platform(versionCatalog.findLibrary("junit5-bom").get()))
        testImplementation(versionCatalog.findLibrary("junit5-jupiterApi").get())

        testRuntimeOnly(versionCatalog.findLibrary("junit5-jupiterEngine").get())
        testRuntimeOnly(versionCatalog.findLibrary("junit5-jupiterVintage").get())
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
    pluginName.set("aws-toolkit-jetbrains")

    localPath.set(toolkitIntelliJ.localPath())
    version.set(toolkitIntelliJ.version())

    plugins.set(toolkitIntelliJ.productProfile().map { it.plugins.toMutableList() })

    downloadSources.set(toolkitIntelliJ.ideFlavor.map { it == IdeFlavor.IC && !project.isCi() })
    instrumentCode.set(toolkitIntelliJ.ideFlavor.map { it == IdeFlavor.IC || it == IdeFlavor.IU })
}

tasks.jar {
    archiveBaseName.set(toolkitIntelliJ.ideFlavor.map { "aws-toolkit-jetbrains-$it" })
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
val openedPackages = OpenedPackages + listOf(
    // very noisy in UI tests
    "--add-opens=java.desktop/javax.swing.text=ALL-UNNAMED",
) + with(OperatingSystem.current()) {
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
    val jetbrainsCoreTestResources = project(":jetbrains-core").projectDir.resolve("tst-resources")
    // FIX_WHEN_MIN_IS_221: log4j 1.2 removed in 221
    systemProperty("log4j.configuration", jetbrainsCoreTestResources.resolve("log4j.xml"))
    systemProperty("idea.log.config.properties.file", jetbrainsCoreTestResources.resolve("toolkit-test-log.properties"))
    systemProperty("org.gradle.project.ideProfileName", ideProfile.name)

    jvmArgs(openedPackages)

    useJUnitPlatform()
}

tasks.withType<JavaExec> {
    systemProperty("aws.toolkits.enableTelemetry", false)
}

tasks.runIde {
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

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
tasks.withType<DownloadRobotServerPluginTask> {
    version.set(versionCatalog.findVersion("intellijRemoteRobot").get().requiredVersion)
}

// Enable coverage for the UI test target IDE
ciOnly {
    extensions.getByType<JacocoPluginExtension>().applyTo(tasks.withType<RunIdeForUiTestTask>())
}
tasks.withType<RunIdeForUiTestTask>().all {
    systemProperty("robot-server.port", remoteRobotPort)
    // mac magic
    systemProperty("ide.mac.message.dialogs.as.sheets", "false")
    systemProperty("jbScreenMenuBar.enabled", "false")
    systemProperty("apple.laf.useScreenMenuBar", "false")
    systemProperty("ide.mac.file.chooser.native", "false")

    systemProperty("jb.consents.confirmation.enabled", "false")
    // This does some magic in EndUserAgreement.java to make it not show the privacy policy
    systemProperty("jb.privacy.policy.text", "<!--999.999-->")
    systemProperty("ide.show.tips.on.startup.default.value", false)

    systemProperty("aws.telemetry.skip_prompt", "true")
    systemProperty("aws.suppress_deprecation_prompt", true)
    systemProperty("idea.trust.all.projects", "true")

    // These are experiments to enable for UI tests
    systemProperty("aws.experiment.connectedLocalTerminal", true)
    systemProperty("aws.experiment.dynamoDb", true)

    debugOptions {
        enabled.set(true)
        suspend.set(false)
    }

    jvmArgs(openedPackages)

    ciOnly {
        configure<JacocoTaskExtension> {
            // sync with testing-subplugin
            // don't instrument sdk, icons, etc.
            includes = listOf("software.aws.toolkits.*")
            excludes = listOf("software.aws.toolkits.telemetry.*")

            // 221+ uses a custom classloader and jacoco fails to find classes
            isIncludeNoLocationClasses = true

            output = Output.TCP_CLIENT // Dump to our jacoco server instead of to a file
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
