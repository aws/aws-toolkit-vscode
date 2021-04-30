// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.Detekt
import io.gitlab.arturbosch.detekt.DetektCreateBaselineTask

val detektVersion: String by project

plugins {
    id("io.gitlab.arturbosch.detekt")
    id("toolkit-testing")
}

dependencies {
    detektPlugins("io.gitlab.arturbosch.detekt:detekt-formatting:$detektVersion")
    detektPlugins(project(":detekt-rules"))
}

detekt {
    val rulesProject = project(":detekt-rules").projectDir
    input.from("$projectDir")
    buildUponDefaultConfig = false
    parallel = true
    allRules = false
    config = files("$rulesProject/detekt.yml")
    baseline = file("$rulesProject/baseline.xml")

    reports {
        html.enabled = true // Human readable report
        xml.enabled = true // Checkstyle like format for CI tool integrations
    }
}

val detektProjectBaseline by tasks.registering(DetektCreateBaselineTask::class) {
    val rulesProject = project(":detekt-rules").projectDir
    description = "Updates the DeteKt baseline file"
    buildUponDefaultConfig.set(false)
    ignoreFailures.set(true)
    parallel.set(true)
    setSource(files(rootDir))
    config.setFrom(files("$rulesProject/detekt.yml"))
    baseline.set(file("$rulesProject/baseline.xml"))
    include("**/*.kt")
    include("**/*.kts")
    exclude("**/resources/**")
    exclude("**/build/**")
}

tasks.withType<Detekt>().configureEach {
    jvmTarget = "1.8"
    dependsOn(":detekt-rules:assemble")
}

tasks.check {
    dependsOn(tasks.detekt)
}
