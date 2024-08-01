// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import org.jetbrains.intellij.platform.gradle.tasks.aware.SandboxAware
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension

project.extensions.create<ToolkitIntelliJExtension>("intellijToolkit")

plugins {
    id("org.jetbrains.intellij.platform.module")
}

intellijPlatform {
    instrumentCode = false
}

dependencies {
    intellijPlatform {
        instrumentationTools()
    }
}

// CI keeps running out of RAM, so limit IDE instance count to 4
ciOnly {
    abstract class NoopBuildService : BuildService<BuildServiceParameters.None> {}
    val noopService = gradle.sharedServices.registerIfAbsent("noopService", NoopBuildService::class.java) {
        maxParallelUsages = 2
    }

    tasks.matching { it is Test || it is SandboxAware }.configureEach {
        usesService(noopService)
    }
}
