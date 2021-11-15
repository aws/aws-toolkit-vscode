// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

val detektVersion: String by project

plugins {
    id("io.gitlab.arturbosch.detekt")
    id("toolkit-testing")
}

// TODO: https://github.com/gradle/gradle/issues/15383
val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
dependencies {
    detektPlugins(versionCatalog.findDependency("detekt-formattingRules").get())
    detektPlugins(project(":detekt-rules"))
}

detekt {
    val rulesProject = project(":detekt-rules").projectDir
    source.setFrom("$projectDir")
    buildUponDefaultConfig = false
    parallel = true
    allRules = false
    config = files("$rulesProject/detekt.yml")
    autoCorrect = true

    reports {
        html.enabled = true // Human readable report
        xml.enabled = true // Checkstyle like format for CI tool integrations
    }
}
