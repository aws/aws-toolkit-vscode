// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.PatchPluginXmlTask
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.toolkitIntelliJ

// publish-root should imply publishing-conventions, but we keep separate so that gateway always has the GW flavor
plugins {
    id("toolkit-intellij-plugin")
    id("org.jetbrains.intellij.platform")
}

tasks.withType<PatchPluginXmlTask>().configureEach {
    sinceBuild.set(toolkitIntelliJ.ideProfile().map { it.sinceVersion })
    untilBuild.set(toolkitIntelliJ.ideProfile().map { it.untilVersion })
}

intellijPlatform {
    instrumentCode = false

    verifyPlugin {
        ides {
            // recommended() appears to resolve latest EAP for a product?
            ide(provider { IntelliJPlatformType.IntellijIdeaCommunity }, toolkitIntelliJ.version())
            ide(provider { IntelliJPlatformType.IntellijIdeaUltimate }, toolkitIntelliJ.version())
        }
    }
}

dependencies {
    intellijPlatform {
        pluginVerifier()

        val alternativeIde = providers.environmentVariable("ALTERNATIVE_IDE")
        if (alternativeIde.isPresent) {
            // remove the trailing slash if there is one or else it will not work
            val value = alternativeIde.get()
            val path = File(value.trimEnd('/'))
            if (path.exists()) {
                local(path)
            } else {
                throw GradleException("ALTERNATIVE_IDE path not found $value")
            }
        } else {
            val runIdeVariant = providers.gradleProperty("runIdeVariant")

            // prefer versions declared in IdeVersions
            toolkitIntelliJ.apply {
                ideFlavor.convention(IdeFlavor.values().firstOrNull { it.name == runIdeVariant.orNull } ?: IdeFlavor.IC)
            }
            val (type, version) = if (runIdeVariant.isPresent) {
                val type = toolkitIntelliJ.ideFlavor.map { IntelliJPlatformType.fromCode(it.toString()) }
                val version = toolkitIntelliJ.version()

                type to version
            } else {
                provider { IntelliJPlatformType.IntellijIdeaCommunity } to toolkitIntelliJ.version()
            }

            create(type, version, useInstaller = false)
            jetbrainsRuntime()
        }
    }
}

tasks.runIde {
    systemProperty("aws.toolkit.developerMode", true)
    systemProperty("ide.plugins.snapshot.on.unload.fail", true)
    systemProperty("memory.snapshots.path", project.rootDir)
    systemProperty("idea.auto.reload.plugins", false)
}
