// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.changelog.tasks.GeneratePluginChangeLog
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.telemetry.generator.gradle.GenerateTelemetry

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-testing")
    id("toolkit-integration-testing")
    id("toolkit-intellij-subplugin")
}

buildscript {
    dependencies {
        classpath(libs.telemetryGenerator)
    }
}

intellijToolkit {
    ideFlavor.set(IdeFlavor.IC)
}

sourceSets {
    main {
        java.srcDir("${project.buildDir}/generated-src")
    }
}

val generateTelemetry = tasks.register<GenerateTelemetry>("generateTelemetry") {
    inputFiles = listOf(file("${project.projectDir}/resources/telemetryOverride.json"))
    outputDirectory = file("${project.buildDir}/generated-src")
}

tasks.compileKotlin {
    dependsOn(generateTelemetry)
}

val changelog = tasks.register<GeneratePluginChangeLog>("pluginChangeLog") {
    includeUnreleased.set(true)
    changeLogFile.set(project.file("$buildDir/changelog/change-notes.xml"))
}

tasks.jar {
    dependsOn(changelog)
    archiveBaseName.set("aws-intellij-toolkit-core")
    from(changelog) {
        into("META-INF")
    }
}

val codewhispererReadmeAssets = tasks.register<Sync>("codewhispererReadmeAssets") {
    from("${project.projectDir}/assets")
    into("$buildDir/assets")
}

tasks.prepareSandbox {
    dependsOn(codewhispererReadmeAssets)
    from(codewhispererReadmeAssets) {
        into("aws-toolkit-jetbrains/assets")
    }
}

tasks.testJar {
    // classpath.index is a duplicated
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
}

tasks.processTestResources {
    // TODO how can we remove this. Fails due to:
    // "customerUploadedEventSchemaMultipleTypes.json.txt is a duplicate but no duplicate handling strategy has been set"
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
}

dependencies {
    api(project(":core"))
    api(libs.aws.apacheClient)
    api(libs.aws.apprunner)
    api(libs.aws.cloudcontrol)
    api(libs.aws.cloudformation)
    api(libs.aws.cloudwatchlogs)
    api(libs.aws.dynamodb)
    api(libs.aws.ec2)
    api(libs.aws.ecr)
    api(libs.aws.ecs)
    api(libs.aws.iam)
    api(libs.aws.lambda)
    api(libs.aws.rds)
    api(libs.aws.redshift)
    api(libs.aws.s3)
    api(libs.aws.schemas)
    api(libs.aws.secretsmanager)
    api(libs.aws.sns)
    api(libs.aws.sqs)

    implementation(libs.bundles.jackson)
    implementation(libs.zjsonpatch)
    implementation(libs.commonmark)

    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    testImplementation(libs.wiremock)
    testImplementation(libs.kotlin.coroutinesTest)
    testImplementation(libs.kotlin.coroutinesDebug)
}
