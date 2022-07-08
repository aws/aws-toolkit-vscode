// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.eclipse.jgit.api.Git
import org.gradle.testing.jacoco.plugins.JacocoTaskExtension.Output
import org.jetbrains.intellij.tasks.DownloadRobotServerPluginTask
import org.jetbrains.intellij.tasks.RunIdeForUiTestTask
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.findFolders
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension
import software.aws.toolkits.gradle.isCi
import java.io.IOException

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

    plugins.withType<ToolkitIntegrationTestingPlugin> {
        maybeCreate("integrationTest").apply {
            java.srcDirs(findFolders(project, "it", ideProfile))
            resources.srcDirs(findFolders(project, "it-resources", ideProfile))
        }
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

    // TODO: https://github.com/gradle/gradle/issues/15383
    val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
    dependencies {
        testImplementation(platform(versionCatalog.findLibrary("junit5-bom").get()))
        testImplementation(versionCatalog.findLibrary("junit5-jupiterApi").get())

        testRuntimeOnly(versionCatalog.findLibrary("junit5-jupiterEngine").get())
        testRuntimeOnly(versionCatalog.findLibrary("junit5-jupiterVintage").get())
    }
}

tasks.processResources {
    // needed because both rider and ultimate include plugin-datagrip.xml which we are fine with
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
}

// Run after the project has been evaluated so that the extension (intellijToolkit) has been configured
intellij {
    pluginName.set("aws-toolkit-jetbrains")

    localPath.set(toolkitIntelliJ.localPath())
    version.set(toolkitIntelliJ.version())

    plugins.set(toolkitIntelliJ.productProfile().map { it.plugins.toMutableList() })

    downloadSources.set(toolkitIntelliJ.ideFlavor.map { it == IdeFlavor.IC && !project.isCi() })
    instrumentCode.set(toolkitIntelliJ.ideFlavor.map { it != IdeFlavor.RD })
}

tasks.jar {
    archiveBaseName.set(toolkitIntelliJ.ideFlavor.map { "aws-toolkit-jetbrains-$it" })
}

tasks.patchPluginXml {
    sinceBuild.set(toolkitIntelliJ.ideProfile().map { it.sinceVersion })
    untilBuild.set(toolkitIntelliJ.ideProfile().map { it.untilVersion })
}

// attach the current commit hash on local builds
if (!project.isCi()){
    val buildMetadata = try {
        val git = Git.open(project.rootDir)
        val currentShortHash = git.repository.findRef("HEAD").objectId.abbreviate(7).name()
        val isDirty = git.status().call().hasUncommittedChanges()

        buildString {
            append(currentShortHash)

            if (isDirty) {
                append(".modified")
            }
        }
    } catch(e: IOException) {
        logger.warn("Could not determine current commit", e)

        "unknownCommit"
    }

    tasks.patchPluginXml {
        version.set("${version.get()}+$buildMetadata")
    }

    tasks.buildPlugin {
        archiveClassifier.set(buildMetadata)
    }
}

// Disable building the settings search cache since it 1. fails the build, 2. gets run on the final packaged plugin
tasks.buildSearchableOptions {
    enabled = false
}

tasks.withType<Test>().all {
    systemProperty("log.dir", intellij.sandboxDir.map { "$it-test/logs" }.get())
    systemProperty("testDataPath", project.rootDir.resolve("testdata").absolutePath)
    val jetbrainsCoreTestResources = project(":jetbrains-core").projectDir.resolve("tst-resources")
    // FIX_WHEN_MIN_IS_221: log4j 1.2 removed in 221
    systemProperty("log4j.configuration", jetbrainsCoreTestResources.resolve("log4j.xml"))
    systemProperty("idea.log.config.properties.file", jetbrainsCoreTestResources.resolve("toolkit-test-log.properties"))

    // https://github.com/JetBrains/gradle-intellij-plugin/blob/f87d997479e882546dd6005240e3895c1a0c2333/src/main/kotlin/org/jetbrains/intellij/tasks/RunIdeBase.kt#L314
    jvmArgs(
        listOf(
            "--add-opens=java.base/java.io=ALL-UNNAMED",
            "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
            "--add-opens=java.base/java.lang=ALL-UNNAMED",
            "--add-opens=java.base/java.net=ALL-UNNAMED",
            "--add-opens=java.base/java.nio=ALL-UNNAMED",
            "--add-opens=java.base/java.nio.charset=ALL-UNNAMED",
            "--add-opens=java.base/java.text=ALL-UNNAMED",
            "--add-opens=java.base/java.time=ALL-UNNAMED",
            "--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED",
            "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
            "--add-opens=java.base/java.util=ALL-UNNAMED",
            "--add-opens=java.base/jdk.internal.vm=ALL-UNNAMED",
            "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
            "--add-opens=java.desktop/com.apple.eawt.event=ALL-UNNAMED",
            "--add-opens=java.desktop/com.apple.eawt=ALL-UNNAMED",
            "--add-opens=java.desktop/com.apple.laf=ALL-UNNAMED",
//            "--add-opens=java.desktop/com.sun.java.swing.plaf.gtk=ALL-UNNAMED",
            "--add-opens=java.desktop/java.awt.dnd.peer=ALL-UNNAMED",
            "--add-opens=java.desktop/java.awt.event=ALL-UNNAMED",
            "--add-opens=java.desktop/java.awt.image=ALL-UNNAMED",
            "--add-opens=java.desktop/java.awt.peer=ALL-UNNAMED",
            "--add-opens=java.desktop/java.awt=ALL-UNNAMED",
            "--add-opens=java.desktop/javax.swing.plaf.basic=ALL-UNNAMED",
            "--add-opens=java.desktop/javax.swing.text.html=ALL-UNNAMED",
            "--add-opens=java.desktop/javax.swing=ALL-UNNAMED",
//            "--add-opens=java.desktop/sun.awt.X11=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.awt.datatransfer=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.awt.image=ALL-UNNAMED",
//            "--add-opens=java.desktop/sun.awt.windows=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.awt=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.font=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.java2d=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.lwawt.macosx=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.lwawt=ALL-UNNAMED",
            "--add-opens=java.desktop/sun.swing=ALL-UNNAMED",
            "--add-opens=jdk.attach/sun.tools.attach=ALL-UNNAMED",
            "--add-opens=jdk.internal.jvmstat/sun.jvmstat.monitor=ALL-UNNAMED",
            "--add-opens=jdk.jdi/com.sun.tools.jdi=ALL-UNNAMED",
            "--add-opens=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED",
            "--add-opens=java.base/sun.security.ssl=ALL-UNNAMED",
            "--add-opens=java.base/sun.security.util=ALL-UNNAMED",
        )
    )

    useJUnitPlatform()
}

tasks.withType<JavaExec> {
    systemProperty("aws.toolkits.enableTelemetry", false)
}

tasks.runIde {
    systemProperty("aws.toolkit.developerMode", true)
    systemProperty("ide.plugins.snapshot.on.unload.fail", true)
    systemProperty("memory.snapshots.path", project.rootDir)

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

    ciOnly {
        configure<JacocoTaskExtension> {
            includes = listOf("software.aws.toolkits.*")
            output = Output.TCP_CLIENT // Dump to our jacoco server instead of to a file
        }
    }
}
