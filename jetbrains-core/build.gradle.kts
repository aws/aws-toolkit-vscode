// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import groovy.lang.Closure
import org.gradle.jvm.tasks.Jar
import org.jetbrains.intellij.IntelliJPluginExtension
import org.jetbrains.intellij.tasks.PatchPluginXmlTask
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import software.aws.toolkits.telemetry.generator.gradle.GenerateTelemetry
import toolkits.gradle.changelog.tasks.GeneratePluginChangeLog
// Cannot be removed or else it will fail to compile
import org.jetbrains.intellij.IntelliJPlugin

plugins {
    id("org.jetbrains.intellij")
}
apply(from = "../intellijJVersions.gradle")

buildscript {
    val telemetryVersion: String by project
    repositories {
        mavenCentral()
        maven { setUrl("https://jitpack.io") }
    }
    dependencies {
        classpath("software.aws.toolkits:telemetry-generator:$telemetryVersion")
    }
}

val telemetryVersion: String by project
val awsSdkVersion: String by project
val coroutinesVersion: String by project

val ideSdkVersion: Closure<String> by ext
val idePlugins: Closure<ArrayList<String>> by ext
val ideSinceVersion: Closure<String> by ext
val ideUntilVersion: Closure<String> by ext

val compileKotlin: KotlinCompile by tasks
val patchPluginXml: PatchPluginXmlTask by tasks

intellij {
    val rootIntelliJTask = rootProject.intellij
    version = ideSdkVersion("IC")
    setPlugins(*(idePlugins("IC").toArray()))
    pluginName = rootIntelliJTask.pluginName
    updateSinceUntilBuild = rootIntelliJTask.updateSinceUntilBuild
    downloadSources = rootIntelliJTask.downloadSources
}

patchPluginXml.setSinceBuild(ideSinceVersion())
patchPluginXml.setUntilBuild(ideUntilVersion())

configurations {
    testArtifacts
}

val generateTelemetry = tasks.register<GenerateTelemetry>("generateTelemetry") {
    inputFiles = listOf()
    outputDirectory = file("${project.buildDir}/generated-src")
}
compileKotlin.dependsOn(generateTelemetry)

sourceSets {
    main.get().java.srcDir("${project.buildDir}/generated-src")
}

tasks.test {
    systemProperty("log.dir", "${project.intellij.sandboxDirectory}-test/logs")
}

val changelog = tasks.register<GeneratePluginChangeLog>("pluginChangeLog") {
    includeUnreleased.set(true)
    changeLogFile.set(project.file("$buildDir/changelog/change-notes.xml"))
}

tasks.jar {
    dependsOn(changelog)
    archiveBaseName.set("aws-intellij-toolkit-core")
    from(changelog.get().changeLogFile) {
        into("META-INF")
    }
}

dependencies {
    api(project(":core"))
    api("software.amazon.awssdk:s3:$awsSdkVersion")
    api("software.amazon.awssdk:lambda:$awsSdkVersion")
    api("software.amazon.awssdk:iam:$awsSdkVersion")
    api("software.amazon.awssdk:ecs:$awsSdkVersion")
    api("software.amazon.awssdk:cloudformation:$awsSdkVersion")
    api("software.amazon.awssdk:schemas:$awsSdkVersion")
    api("software.amazon.awssdk:cloudwatchlogs:$awsSdkVersion")
    api("software.amazon.awssdk:apache-client:$awsSdkVersion")
    api("software.amazon.awssdk:resourcegroupstaggingapi:$awsSdkVersion")
    api("software.amazon.awssdk:rds:$awsSdkVersion")
    api("software.amazon.awssdk:redshift:$awsSdkVersion")
    api("software.amazon.awssdk:secretsmanager:$awsSdkVersion")
    api("software.amazon.awssdk:sqs:$awsSdkVersion")

    testImplementation(project(path = ":core", configuration = "testArtifacts"))
    testImplementation("com.github.tomakehurst:wiremock-jre8:2.26.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:$coroutinesVersion")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-debug:$coroutinesVersion")

    integrationTestImplementation("org.eclipse.jetty:jetty-servlet:9.4.15.v20190215")
    integrationTestImplementation("org.eclipse.jetty:jetty-proxy:9.4.15.v20190215")
}
