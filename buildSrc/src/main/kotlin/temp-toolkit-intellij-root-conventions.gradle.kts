// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.gradle.kotlin.dsl.create
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.invoke
import org.gradle.kotlin.dsl.project
import org.gradle.kotlin.dsl.provideDelegate
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.extensions.IntelliJPlatformExtension
import org.jetbrains.intellij.platform.gradle.plugins.project.DownloadRobotServerPluginTask
import org.jetbrains.intellij.platform.gradle.tasks.TestIdeUiTask
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

plugins {
    id("toolkit-testing") // Needed so the coverage configurations are present
    id("toolkit-detekt")
    id("toolkit-publishing-conventions")
    id("toolkit-publish-root-conventions")
}

toolkitIntelliJ.apply {
    val runIdeVariant = providers.gradleProperty("runIdeVariant")
    ideFlavor.set(IdeFlavor.values().firstOrNull { it.name == runIdeVariant.orNull } ?: IdeFlavor.IC)
}

val remoteRobotPort: String by project
val ideProfile = IdeVersions.ideProfile(project)

val toolkitVersion: String by project

// please check changelog generation logic if this format is changed
// also sync with gateway version
version = "$toolkitVersion-${ideProfile.shortName}"

val resharperDlls = configurations.register("resharperDlls") {
    isCanBeConsumed = false
}

val gatewayResources = configurations.register("gatewayResources") {
    isCanBeConsumed = false
}

intellijPlatform {
    projectName = "aws-toolkit-jetbrains"
    instrumentCode = false
}

tasks.prepareSandbox {
    val pluginName = intellijPlatform.projectName

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
    intellijPlatform {
        val type = toolkitIntelliJ.ideFlavor.map { IntelliJPlatformType.fromCode(it.toString()) }
        val version = toolkitIntelliJ.version()

        create(type, version, useInstaller = false)
    }

    implementation(project(":plugin-toolkit:jetbrains-ultimate"))
    project.findProject(":plugin-toolkit:jetbrains-gateway")?.let {
        // does this need to be the instrumented variant?
        implementation(it)
        gatewayResources(project(":plugin-toolkit:jetbrains-gateway", configuration = "gatewayResources"))
    }

    implementation(project(":plugin-toolkit:jetbrains-rider"))
    resharperDlls(project(":plugin-toolkit:jetbrains-rider", configuration = "resharperDlls"))
}

tasks.withType<TestIdeUiTask>().configureEach {
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
