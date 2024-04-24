// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.create
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.invoke
import org.gradle.kotlin.dsl.project
import org.gradle.kotlin.dsl.provideDelegate
import org.gradle.kotlin.dsl.withType
import org.gradle.testing.jacoco.plugins.JacocoPluginExtension
import org.gradle.testing.jacoco.plugins.JacocoTaskExtension
import org.jetbrains.intellij.tasks.DownloadRobotServerPluginTask
import org.jetbrains.intellij.tasks.RunIdeForUiTestTask
import org.jetbrains.intellij.utils.OpenedPackages
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension

plugins {
    id("org.jetbrains.intellij")
    id("toolkit-testing") // Needed so the coverage configurations are present
    id("toolkit-detekt")
    id("toolkit-publishing-conventions")
}

val toolkitIntelliJ = project.extensions.create<ToolkitIntelliJExtension>("intellijToolkit").apply {
    val runIdeVariant = providers.gradleProperty("runIdeVariant")
    ideFlavor.set(IdeFlavor.values().firstOrNull { it.name == runIdeVariant.orNull } ?: IdeFlavor.IC)
}

val remoteRobotPort: String by project
val ideProfile = IdeVersions.ideProfile(project)

val toolkitVersion: String by project
val publishToken: String by project
val publishChannel: String by project

// please check changelog generation logic if this format is changed
// also sync with gateway version
version = "$toolkitVersion-${ideProfile.shortName}"

val resharperDlls = configurations.create("resharperDlls") {
    isCanBeConsumed = false
}

val gatewayResources = configurations.create("gatewayResources") {
    isCanBeConsumed = false
}

intellij {
    pluginName.set("aws-toolkit-jetbrains")

    localPath.set(toolkitIntelliJ.localPath())
    version.set(toolkitIntelliJ.version())

    updateSinceUntilBuild.set(false)
    instrumentCode.set(false)
}

tasks.prepareSandbox {
    intoChild(pluginName.map { "$it/dotnet" })
        .from(resharperDlls)

    intoChild(pluginName.map { "$it/gateway-resources" })
        .from(gatewayResources)
}

// We have no source in this project, so skip test task
tasks.test {
    enabled = false
}

dependencies {
    implementation(project(":plugin-toolkit:jetbrains-core"))
    implementation(project(":plugin-toolkit:jetbrains-ultimate"))
    project.findProject(":plugin-toolkit:jetbrains-gateway")?.let {
        // does this need to be the instrumented variant?
        implementation(it)
        gatewayResources(project(":plugin-toolkit:jetbrains-gateway", configuration = "gatewayResources"))
    }

    implementation(project(":plugin-toolkit:jetbrains-rider"))
    resharperDlls(project(":plugin-toolkit:jetbrains-rider", configuration = "resharperDlls"))
}

// Enable coverage for the UI test target IDE
ciOnly {
    extensions.getByType<JacocoPluginExtension>().applyTo(tasks.withType<RunIdeForUiTestTask>())
}
tasks.withType<DownloadRobotServerPluginTask> {
    // TODO: https://github.com/gradle/gradle/issues/15383
    version.set(versionCatalogs.named("libs").findVersion("intellijRemoteRobot").get().requiredVersion)
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

    jvmArgs(
        OpenedPackages + listOf(
            // very noisy in UI tests
            "--add-opens=java.desktop/javax.swing.text=ALL-UNNAMED",
        )
    )

    ciOnly {
        configure<JacocoTaskExtension> {
            // sync with testing-subplugin
            // don't instrument sdk, icons, etc.
            includes = listOf("software.aws.toolkits.*")
            excludes = listOf("software.aws.toolkits.telemetry.*")

            // 221+ uses a custom classloader and jacoco fails to find classes
            isIncludeNoLocationClasses = true

            output = JacocoTaskExtension.Output.TCP_CLIENT // Dump to our jacoco server instead of to a file
        }
    }
}
