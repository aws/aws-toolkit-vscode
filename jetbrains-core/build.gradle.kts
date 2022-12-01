// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import org.jetbrains.kotlin.gradle.plugin.KotlinPlatformType
import software.aws.toolkits.gradle.buildMetadata
import software.aws.toolkits.gradle.changelog.tasks.GeneratePluginChangeLog
import software.aws.toolkits.gradle.intellij.IdeFlavor
import software.aws.toolkits.gradle.intellij.IdeVersions
import software.aws.toolkits.gradle.isCi
import software.aws.toolkits.gradle.jvmTarget
import software.aws.toolkits.telemetry.generator.gradle.GenerateTelemetry

val toolkitVersion: String by project
val ideProfile = IdeVersions.ideProfile(project)

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
    from(changelog) {
        into("META-INF")
    }
}

val gatewayPluginXml = tasks.create<org.jetbrains.intellij.tasks.PatchPluginXmlTask>("patchPluginXmlForGateway") {
    pluginXmlFiles.set(tasks.patchPluginXml.map { it.pluginXmlFiles }.get())
    destinationDir.set(project.buildDir.resolve("patchedPluginXmlFilesGW"))

    val buildSuffix = if (!project.isCi()) "+${buildMetadata()}" else ""
    version.set("GW-$toolkitVersion-${ideProfile.shortName}$buildSuffix")
}

val gatewayArtifacts by configurations.creating {
    isCanBeConsumed = true
    isCanBeResolved = false
    // share same dependencies as default configuration
    extendsFrom(configurations["implementation"], configurations["runtimeOnly"])

    attributes {
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.LIBRARY))
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
        attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL))
        attribute(KotlinPlatformType.Companion.attribute, KotlinPlatformType.jvm)
        attribute(TargetJvmVersion.TARGET_JVM_VERSION_ATTRIBUTE, project.jvmTarget().get().majorVersion.toInt())
        attribute(TargetJvmEnvironment.TARGET_JVM_ENVIRONMENT_ATTRIBUTE, objects.named(TargetJvmEnvironment.STANDARD_JVM))
        attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE, objects.named("gateway-instrumented-jar"))
    }
}

val gatewayJar = tasks.create<Jar>("gatewayJar") {
    archiveBaseName.set("aws-toolkit-jetbrains-IC-GW")
    from(sourceSets.main.get().output) {
        exclude("**/plugin.xml")
        exclude("**/plugin-intellij.xml")
        exclude("**/inactive")
    }

    from(gatewayPluginXml) {
        into("META-INF")
    }

    val pluginGateway = sourceSets.main.get().resources.first { it.name == "plugin-gateway.xml" }
    from(pluginGateway) {
        into("META-INF")
    }
}

artifacts {
    add("gatewayArtifacts", gatewayJar)
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
