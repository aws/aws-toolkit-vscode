// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import software.aws.toolkits.gradle.changelog.tasks.GeneratePluginChangeLog
import software.aws.toolkits.gradle.intellij.ToolkitIntelliJExtension.IdeFlavor
import software.aws.toolkits.telemetry.generator.gradle.GenerateTelemetry

plugins {
    id("toolkit-kotlin-conventions")
    id("toolkit-detekt")
    id("toolkit-testing")
    id("toolkit-integration-testing")
    id("toolkit-intellij-subplugin")
}

buildscript {
    val telemetryVersion: String by project
    dependencies {
        classpath("software.aws.toolkits:telemetry-generator:$telemetryVersion")
    }
}

val telemetryVersion: String by project
val awsSdkVersion: String by project
val coroutinesVersion: String by project
val jacksonVersion: String by project

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

tasks.processTestResources {
    // TODO how can we remove this. Fails due to:
    // "customerUploadedEventSchemaMultipleTypes.json.txt is a duplicate but no duplicate handling strategy has been set"
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
}

dependencies {
    api(project(":core"))
    api("software.amazon.awssdk:s3:$awsSdkVersion")
    api("software.amazon.awssdk:dynamodb:$awsSdkVersion")
    api("software.amazon.awssdk:lambda:$awsSdkVersion")
    api("software.amazon.awssdk:iam:$awsSdkVersion")
    api("software.amazon.awssdk:ecr:$awsSdkVersion")
    api("software.amazon.awssdk:ecs:$awsSdkVersion")
//    api("software.amazon.awssdk:cloudformation:$awsSdkVersion")
    api("software.amazon.awssdk:schemas:$awsSdkVersion")
    api("software.amazon.awssdk:cloudwatchlogs:$awsSdkVersion")
    api("software.amazon.awssdk:apache-client:$awsSdkVersion")
    api("software.amazon.awssdk:resourcegroupstaggingapi:$awsSdkVersion")
    api("software.amazon.awssdk:rds:$awsSdkVersion")
    api("software.amazon.awssdk:redshift:$awsSdkVersion")
    api("software.amazon.awssdk:secretsmanager:$awsSdkVersion")
    api("software.amazon.awssdk:sns:$awsSdkVersion")
    api("software.amazon.awssdk:sqs:$awsSdkVersion")
    api("software.amazon.awssdk:apprunner:$awsSdkVersion")
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:$jacksonVersion")

    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    testImplementation("com.github.tomakehurst:wiremock:2.27.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:$coroutinesVersion")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-debug:$coroutinesVersion")
}
