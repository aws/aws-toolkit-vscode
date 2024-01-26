// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import de.undercouch.gradle.tasks.download.Download
import org.gradle.nativeplatform.platform.internal.DefaultNativePlatform

plugins {
    id("de.undercouch.download")
}

val downloadGitSecrets = tasks.register<Download>("downloadGitSecrets") {
    src("https://raw.githubusercontent.com/awslabs/git-secrets/master/git-secrets")
    dest("$buildDir/git-secrets")
    onlyIfModified(true)
    useETag(true)
}

val gitSecrets = tasks.register<Exec>("gitSecrets") {
    onlyIf {
        !DefaultNativePlatform.getCurrentOperatingSystem().isWindows
    }

    dependsOn(downloadGitSecrets)
    workingDir(project.rootDir)
    val path = "$buildDir${File.pathSeparator}"
    val patchendEnv = environment.apply { replace("PATH", path + getOrDefault("PATH", "")) }
    environment = patchendEnv

    commandLine("/bin/sh", "$buildDir/git-secrets", "--register-aws")

    // cleaner than having multiple separate exec tasks
    doLast {
        exec {
            workingDir(project.rootDir)
            commandLine("git", "config", "--add", "secrets.allowed", "123456789012")
        }

        exec {
            workingDir(project.rootDir)
            environment = patchendEnv
            commandLine("/bin/sh", "$buildDir/git-secrets", "--scan")
        }
    }
}

tasks.findByName("check")?.let {
    it.dependsOn(gitSecrets)
}
